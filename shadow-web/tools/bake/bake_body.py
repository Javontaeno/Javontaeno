# Bake a normalised body mesh + fitted joints into a skinned, part-split, UV-mapped binary for the game.
# usage: bake_body.py mesh.json joints.json out_prefix
import json, sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contours import contours

JOINTS = ['pivot', 'hips', 'spine', 'chest', 'neck', 'head', 'arL', 'elL', 'haL', 'arR', 'elR', 'haR',
          'thL', 'knL', 'ftL', 'thR', 'knR', 'ftR', 'fiL', 'fiR']
PARENT = {'hips': 'pivot', 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck',
          'arL': 'chest', 'elL': 'arL', 'haL': 'elL', 'fiL': 'haL', 'arR': 'chest', 'elR': 'arR', 'haR': 'elR', 'fiR': 'haR',
          'thL': 'hips', 'knL': 'thL', 'ftL': 'knL', 'thR': 'hips', 'knR': 'thR', 'ftR': 'knR'}
PART = {'hips': 'pelvis', 'spine': 'abdomen', 'chest': 'chest', 'neck': 'neck', 'head': 'head',
        'ar': 'upperArm', 'el': 'foreArm', 'ha': 'hand', 'fi': 'hand', 'th': 'thigh', 'kn': 'shin', 'ft': 'foot'}
PARTS = ['chest', 'abdomen', 'pelvis', 'upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot', 'head', 'neck']
DOWN = np.array([0.0, -1.0, 0.0])


def rot_between(a, b):
    """Minimal rotation matrix taking unit vector a to unit vector b (matches THREE.Quaternion.setFromUnitVectors)."""
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = float(a @ b)
    if c < -0.999999:
        axis = np.cross(a, [1, 0, 0]);
        if np.linalg.norm(axis) < 1e-6: axis = np.cross(a, [0, 0, 1])
        axis /= np.linalg.norm(axis)
        return 2 * np.outer(axis, axis) - np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K / (1 + c)


def part_of(b):
    return PART.get(b, PART.get(b[:2]))


def compute_skin(P, F, J):
    """Skin weights for a welded mesh against the game's joint layout. Returns weights and bind frames."""
    nV = len(P)
    W = {k: np.array(v, dtype=float) for k, v in J.items() if isinstance(v, list) and len(v) == 3}
    W['pivot'] = np.array([0.0, 1.05, 0.0])
    # toes: foot tip per side
    for sd, side in (('L', 1), ('R', -1)):
        fv = P[(P[:, 1] < 0.06) & (P[:, 0] * side > 0)]
        W['toe' + sd] = fv[np.argmax(fv[:, 2])] if len(fv) else W['ft' + sd] + [0, -0.05, 0.17]
    headTop = np.array([0.0, J['headTop'], J['headCenter'][2]])
    # world bind rotations (same construction the game uses)
    R = {'pivot': np.eye(3)}
    CHILD = {'ar': 'el', 'el': 'ha', 'ha': 'fi', 'th': 'kn', 'kn': 'ft'}
    for b in JOINTS[1:]:
        Rp = R[PARENT[b]]
        c = CHILD.get(b[:2]) if b[:2] in CHILD else None
        if c:
            d = W[c + b[2]] - W[b]
            q = rot_between(DOWN, Rp.T @ (d / np.linalg.norm(d)))
            R[b] = Rp @ q
        else:
            R[b] = Rp.copy()
    # bone segments for skinning
    SEG = {'hips': ('hips', 'spine'), 'spine': ('spine', 'chest'), 'chest': ('chest', 'neck'), 'neck': ('neck', 'head')}
    segs = {}
    for b, (a, c) in SEG.items(): segs[b] = (W[a], W[c])
    segs['head'] = (W['head'], headTop)
    for sd in 'LR':
        segs['ar' + sd] = (W['ar' + sd], W['el' + sd]); segs['el' + sd] = (W['el' + sd], W['ha' + sd])
        segs['ha' + sd] = (W['ha' + sd], W['fi' + sd]); segs['fi' + sd] = (W['fi' + sd], np.array(J['tip' + sd]))
        segs['th' + sd] = (W['th' + sd], W['kn' + sd]); segs['kn' + sd] = (W['kn' + sd], W['ft' + sd])
        segs['ft' + sd] = (W['ft' + sd], W['toe' + sd])
    bones = list(segs.keys())
    D = np.zeros((nV, len(bones)))
    for i, b in enumerate(bones):
        a, c = segs[b]; ab = c - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        D[:, i] = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
    # where each bone is allowed to pull
    x, y = P[:, 0], P[:, 1]
    crotch = J['crotch']
    mask = np.ones_like(D, dtype=bool)
    for i, b in enumerate(bones):
        if b in ('arL', 'elL', 'haL', 'fiL'): mask[:, i] = x > 0.04
        if b in ('arR', 'elR', 'haR', 'fiR'): mask[:, i] = x < -0.04
        if b in ('thL', 'knL', 'ftL'): mask[:, i] = (x > -0.005) & (y < W['hips'][1] + 0.06)
        if b in ('thR', 'knR', 'ftR'): mask[:, i] = (x < 0.005) & (y < W['hips'][1] + 0.06)
        if b in ('hips', 'spine', 'chest', 'neck'): mask[:, i] = y > crotch - 0.12
        if b == 'head': mask[:, i] = y > W['neck'][1] + 0.03
        if b in ('fiL', 'fiR'):
            a, c = segs[b]; dirv = (c - a) / np.linalg.norm(c - a)
            mask[:, i] &= ((P - a) @ dirv) > -0.015
        if b in ('haL', 'haR'):
            a, c = segs[b]; dirv = (c - a) / np.linalg.norm(c - a)
            mask[:, i] &= ((P - a) @ dirv) > -0.04
    # thick bones: distance is measured from a capsule surface, so the wide torso claims its own skin
    loops = [l for l in contours(P, F, W['spine'][1] + 0.05) if l[:, 0].min() < 0 < l[:, 0].max()]
    torso_w = np.abs(max(loops, key=len)[:, 0]).max() if loops else 0.15
    k = torso_w / 0.15
    print('torso half-width', round(float(torso_w), 3), 'k', round(float(k), 2))
    RAD = {'hips': 0.11, 'spine': 0.11, 'chest': 0.12, 'neck': 0.045, 'head': 0.08, 'ar': 0.04, 'el': 0.032, 'ha': 0.02, 'fi': 0.008, 'th': 0.06, 'kn': 0.04, 'ft': 0.025}
    for i, b in enumerate(bones): D[:, i] = np.maximum(D[:, i] - RAD.get(b, RAD.get(b[:2], 0.03)) * k, 0)
    for i, b in enumerate(bones):
        if b[:2] == 'ar':
            a, c = segs[b]; dirv = (c - a) / np.linalg.norm(c - a)
            mask[:, i] &= ((P - a) @ dirv) > -0.07       # only skin from the shoulder joint outwards
    Wt = np.where(mask, 1.0 / (D + 0.012) ** 4, 0)
    Wt /= Wt.sum(1, keepdims=True) + 1e-12
    # smooth over the surface so joints bend softly
    nb = [[] for _ in range(nV)]
    for a, b, c in F: nb[a] += [b, c]; nb[b] += [a, c]; nb[c] += [a, b]
    rows = np.repeat(np.arange(nV), [len(n) for n in nb]); cols = np.concatenate([np.array(n, dtype=np.int64) for n in nb])
    deg = np.array([max(1, len(n)) for n in nb], dtype=float)
    for _ in range(6):
        acc = np.zeros_like(Wt); np.add.at(acc, rows, Wt[cols])
        Wt = 0.5 * Wt + 0.5 * acc / deg[:, None]
        Wt = np.where(mask, Wt, 0); Wt /= Wt.sum(1, keepdims=True) + 1e-12
    # keep the 4 strongest influences
    top = np.argsort(-Wt, axis=1)[:, :4]
    tw = np.take_along_axis(Wt, top, 1); tw /= tw.sum(1, keepdims=True)
    bone_idx = np.array([JOINTS.index(b) for b in bones])
    skinIdx = bone_idx[top]
    dom = np.array(bones)[top[:, 0]]
    return dict(W=W, R=R, skinIdx=skinIdx, tw=tw, dom=dom)


def bake(P, F, J):
    sk = compute_skin(P, F, J)
    W, R, skinIdx, tw, dom = sk['W'], sk['R'], sk['skinIdx'], sk['tw'], sk['dom']
    nV = len(P)
    # vertex normals (area weighted)
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    N = np.zeros_like(P); [np.add.at(N, F[:, k], fn) for k in range(3)]
    ln = np.linalg.norm(N, axis=1, keepdims=True); N = np.where(ln > 1e-12, N / np.maximum(ln, 1e-12), [0.0, 1.0, 0.0])
    # triangle → part (majority of its vertices' dominant bones)
    vpart = np.array([PARTS.index(part_of(b)) for b in dom])
    tp = vpart[F]
    tri_part = np.where(tp[:, 1] == tp[:, 2], tp[:, 1], tp[:, 0])
    # UVs per part, in that part's bone frame. Convention (character.js): u around, front (+z) at 0.25, left (+x) at 0.5; v bottom→top
    eyeY = J['eye'][1]
    head_c = np.array([0.0, eyeY - 0.012, J['headCenter'][2]])
    def frame_bone(part, sideL):
        return {'chest': 'chest', 'abdomen': 'spine', 'pelvis': 'hips', 'neck': 'neck', 'head': 'head',
                'upperArm': 'ar', 'foreArm': 'el', 'hand': 'ha', 'thigh': 'th', 'shin': 'kn', 'foot': 'ft'}[part]
    out_pos, out_nrm, out_uv, out_si, out_sw, out_idx, groups = [], [], [], [], [], [], []
    base = 0
    for pi, part in enumerate(PARTS):
        tris = F[tri_part == pi]
        if not len(tris): continue
        vs = np.unique(tris)
        # local coordinates in the part frame (per side for limbs)
        loc = np.zeros((len(vs), 3)); fb = frame_bone(part, True)
        for j, v in enumerate(vs):
            b = fb if part in ('chest', 'abdomen', 'pelvis', 'neck', 'head') else fb + ('L' if P[v, 0] > 0 else 'R')
            o = head_c if part == 'head' else W[b]
            loc[j] = R[b].T @ (P[v] - o)
        u = (np.arctan2(loc[:, 0], loc[:, 2]) + np.pi / 2) / (2 * np.pi) % 1.0
        if part in ('head', 'hand', 'foot'):
            c = loc.mean(0) if part != 'head' else np.zeros(3)
            dv = loc - c
            u = (np.arctan2(dv[:, 0], dv[:, 2]) + np.pi / 2) / (2 * np.pi) % 1.0
            v = 1 - np.arccos(np.clip(dv[:, 1] / (np.linalg.norm(dv, axis=1) + 1e-9), -1, 1)) / np.pi
        else:
            lo, hi = np.percentile(loc[:, 1], 1), np.percentile(loc[:, 1], 99)
            v = np.clip((loc[:, 1] - lo) / (hi - lo + 1e-9), 0, 1)
        lut = {int(vv): j for j, vv in enumerate(vs)}
        # split seam triangles: a triangle spanning the wrap uses u+1 on its low side
        verts = {}; idx = []
        for t in tris:
            us = [u[lut[int(a)]] for a in t]
            wrap = max(us) - min(us) > 0.5
            for a, ua in zip(t, us):
                k = (int(a), wrap and ua < 0.5)
                if k not in verts:
                    verts[k] = len(verts)
                    j = lut[int(a)]
                    out_pos.append(P[a]); out_nrm.append(N[a]); out_uv.append([ua + (1 if k[1] else 0), v[j]])
                    out_si.append(skinIdx[a]); out_sw.append(tw[a])
                idx.append(base + verts[k])
        groups.append({'part': part, 'start': len(out_idx), 'count': len(idx)})
        out_idx += idx
        base += len(verts)
    if DEBUG is not None:
        cols = np.array([[0.9,0.2,0.2],[0.9,0.6,0.2],[0.9,0.9,0.2],[0.2,0.8,0.3],[0.2,0.8,0.8],[0.3,0.4,0.95],[0.6,0.3,0.9],[0.9,0.3,0.7],[0.6,0.6,0.6],[1,1,1],[0.4,0.2,0.1]])
        json.dump({'P': np.round(P, 4).ravel().tolist(), 'F': F.ravel().tolist(), 'C': cols[vpart].ravel().tolist()}, open(DEBUG, 'w'))
    # sizes for fitting costume pieces (hats, belts) to this body
    wl = [l for l in contours(P, F, W['hips'][1] + 0.03) if l[:, 0].min() < 0 < l[:, 0].max()]
    wl = max(wl, key=len) if wl else np.array([[0.15, 0, 0.11], [-0.15, 0, -0.11]])
    meta_fit = {'headR': round(float(J['headTop'] - J['headCenter'][1]), 4),
                'waist': [round(float(np.abs(wl[:, 0]).max()), 4), round(float((wl[:, 2].max() - wl[:, 2].min()) / 2), 4), round(float((wl[:, 2].max() + wl[:, 2].min()) / 2 - W['hips'][2]), 4)]}
    meta = {
        'fit': meta_fit,
        'joints': {k: np.round(v, 5).tolist() for k, v in W.items() if k in JOINTS or k.startswith('toe')},
        'eye': J['eye'], 'headCenter': J['headCenter'], 'headTop': J['headTop'], 'groups': groups,
        'counts': {'verts': base, 'indices': len(out_idx)},
    }
    return meta, np.array(out_pos, np.float32), np.array(out_nrm), np.array(out_uv, np.float32), np.array(out_si, np.uint8), np.array(out_sw), np.array(out_idx)


DEBUG = None
if __name__ == '__main__':
    if len(sys.argv) > 4: DEBUG = sys.argv[4]
    d = json.load(open(sys.argv[1])); P = np.array(d['P'], dtype=float).reshape(-1, 3); F = np.array(d['F'], dtype=np.int64).reshape(-1, 3)
    J = json.load(open(sys.argv[2]))
    meta, pos, nrm, uv, si, sw, idx = bake(P, F, J)
    n8 = np.clip(np.round(nrm * 127), -127, 127).astype(np.int8)
    sw8 = np.round(sw * 255).astype(np.int32)
    sw8[:, 0] += 255 - sw8.sum(1)                       # weights sum to exactly 255
    sw8 = np.clip(sw8, 0, 255).astype(np.uint8)
    I = idx.astype(np.uint16 if meta['counts']['verts'] < 65536 else np.uint32)
    blob = b''; offs = {}
    for name, arr in (('position', pos), ('normal', n8), ('uv', uv), ('skinIndex', si), ('skinWeight', sw8), ('index', I)):
        while len(blob) % 4: blob += b'\0'
        offs[name] = [len(blob), arr.dtype.name, int(arr.size)]
        blob += arr.tobytes()
    meta['buffers'] = offs
    open(sys.argv[3] + '.bin', 'wb').write(blob)
    json.dump(meta, open(sys.argv[3] + '.json', 'w'))
    print('verts', meta['counts']['verts'], 'tris', len(idx) // 3, 'bytes', len(blob), 'groups', [(g['part'], g['count'] // 3) for g in meta['groups']])
