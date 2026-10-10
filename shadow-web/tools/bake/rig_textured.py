# Re-rig a textured GLB (rigged or not) onto Shadow Web's skeleton, keeping its own UVs, materials and textures.
# usage: rig_textured.py in.glb out.glb '<cfg json>'
#   cfg: height (m), slot ('spidey' or a cast id), skipMaterials (substrings), fit (fit_joints overrides), facing ('auto'|'+z'|'-z')
import json, struct, sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fit_joints import fit
from bake_body import compute_skin, JOINTS, PARENT

COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jl])
    bl = struct.unpack_from('<I', b, 20 + jl)[0]
    return j, b[28 + jl:28 + jl + bl]


def accessor(j, bin_, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    dt = np.dtype(COMP[a['componentType']]); n = NCOMP[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', 0)
    if stride and stride != dt.itemsize * n:
        raw = np.frombuffer(bin_, np.uint8, count=stride * (a['count'] - 1) + dt.itemsize * n, offset=off)
        out = np.stack([np.frombuffer(raw[k * stride:k * stride + dt.itemsize * n].tobytes(), dt) for k in range(a['count'])])
    else:
        out = np.frombuffer(bin_, dt, count=a['count'] * n, offset=off).reshape(a['count'], n)
    if a.get('normalized'):
        out = out.astype(np.float32) / {np.int8: 127, np.uint8: 255, np.int16: 32767, np.uint16: 65535}[COMP[a['componentType']]]
    return out.astype(np.float64) if out.dtype.kind == 'f' else out


def trs(n):
    if 'matrix' in n: return np.array(n['matrix'], dtype=float).reshape(4, 4).T
    t = n.get('translation', [0, 0, 0]); q = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
    x, y, z, w = q
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R * np.array(s); M[:3, 3] = t
    return M


def quat_from_matrix(R):
    t = np.trace(R)
    if t > 0:
        s = np.sqrt(t + 1) * 2; w = 0.25 * s; x = (R[2, 1] - R[1, 2]) / s; y = (R[0, 2] - R[2, 0]) / s; z = (R[1, 0] - R[0, 1]) / s
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = np.sqrt(1 + R[0, 0] - R[1, 1] - R[2, 2]) * 2; w = (R[2, 1] - R[1, 2]) / s; x = 0.25 * s; y = (R[0, 1] + R[1, 0]) / s; z = (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = np.sqrt(1 + R[1, 1] - R[0, 0] - R[2, 2]) * 2; w = (R[0, 2] - R[2, 0]) / s; x = (R[0, 1] + R[1, 0]) / s; y = 0.25 * s; z = (R[1, 2] + R[2, 1]) / s
    else:
        s = np.sqrt(1 + R[2, 2] - R[0, 0] - R[1, 1]) * 2; w = (R[1, 0] - R[0, 1]) / s; x = (R[0, 2] + R[2, 0]) / s; y = (R[1, 2] + R[2, 1]) / s; z = 0.25 * s
    q = np.array([x, y, z, w]); return q / np.linalg.norm(q)


def main(src, dst, cfg):
    j, bin_ = read_glb(src)
    world = {}
    def walk(i, M):
        world[i] = M @ trs(j['nodes'][i])
        for c in j['nodes'][i].get('children', []): walk(c, world[i])
    for r in j['scenes'][j.get('scene', 0)]['nodes']: walk(r, np.eye(4))
    skip = cfg.get('skipMaterials', [])
    prims = []  # (pos, nrm, uv, idx, material)
    for ni, n in enumerate(j['nodes']):
        if 'mesh' not in n: continue
        for p in j['meshes'][n['mesh']]['primitives']:
            mat = p.get('material', 0)
            mname = j['materials'][mat].get('name', '') if 'materials' in j else ''
            if any(s in mname for s in skip): continue
            A = p['attributes']
            pos = accessor(j, bin_, A['POSITION'])[:, :3]
            nrm = accessor(j, bin_, A['NORMAL'])[:, :3] if 'NORMAL' in A else np.zeros_like(pos)
            uv = accessor(j, bin_, A['TEXCOORD_0'])[:, :2] if 'TEXCOORD_0' in A else np.zeros((len(pos), 2))
            idx = accessor(j, bin_, p['indices']).reshape(-1) if 'indices' in p else np.arange(len(pos))
            if 'skin' in n and 'JOINTS_0' in A:
                # pose at rest: v = sum_i w_i * (jointWorld_i @ IBM_i) v
                sk = j['skins'][n['skin']]
                IBM = accessor(j, bin_, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
                Mj = np.stack([world[jn] @ IBM[k] for k, jn in enumerate(sk['joints'])])
                Ji = accessor(j, bin_, A['JOINTS_0']).astype(int); Wi = accessor(j, bin_, A['WEIGHTS_0']).astype(float)
                Wi /= Wi.sum(1, keepdims=True) + 1e-12
                ph = np.c_[pos, np.ones(len(pos))]
                Ms = np.einsum('vk,vkij->vij', Wi, Mj[Ji])
                pos = np.einsum('vij,vj->vi', Ms, ph)[:, :3]
                nrm = np.einsum('vij,vj->vi', Ms[:, :3, :3], nrm)
            else:
                M = world[ni]; pos = (np.c_[pos, np.ones(len(pos))] @ M.T)[:, :3]; nrm = nrm @ M[:3, :3].T
            nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
            prims.append([pos, nrm, uv, idx.astype(np.int64), mat])
    P = np.vstack([p[0] for p in prims])
    # orientation & scale: up = +Y, toes forward = +Z, feet on y = 0, given height
    y0 = P[:, 1].min(); H = P[:, 1].max() - y0
    foot = P[P[:, 1] < y0 + H * 0.04]; mid = P[np.abs(P[:, 1] - (y0 + H * 0.5)) < H * 0.03]
    facing = cfg.get('facing', 'auto')
    flip = facing == '-z' or (facing == 'auto' and (foot[:, 2].mean() - mid[:, 2].mean()) < 0)
    s = cfg.get('height', 1.8) / H
    c = np.array([(P[:, 0].max() + P[:, 0].min()) / 2, y0, (P[:, 2].max() + P[:, 2].min()) / 2])
    for p in prims:
        q = (p[0] - c) * s
        if flip: q[:, 0] *= -1; q[:, 2] *= -1; p[1][:, 0] *= -1; p[1][:, 2] *= -1
        p[0] = q
    # weld for topology-aware fitting and skinning, then carry weights back to the split vertices
    offs = np.cumsum([0] + [len(p[0]) for p in prims])
    P = np.vstack([p[0] for p in prims]); F = np.vstack([p[3].reshape(-1, 3) + offs[k] for k, p in enumerate(prims)])
    qk = np.round(P / 0.0008).astype(np.int64)
    _, first, inv = np.unique(qk, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1); Pw = P[first]; Fw = inv[F]; Fw = Fw[(Fw[:, 0] != Fw[:, 1]) & (Fw[:, 1] != Fw[:, 2]) & (Fw[:, 0] != Fw[:, 2])]
    J = fit(Pw, Fw, cfg.get('fit', {}))
    sk = compute_skin(Pw, Fw, J)
    SI = sk['skinIdx'][inv]; SW = sk['tw'][inv].astype(np.float32)
    W, R = sk['W'], sk['R']
    # --- write the GLB -------------------------------------------------------
    out = {'asset': {'version': '2.0', 'generator': 'shadow-web rig_textured', 'extras': {
        'shadowweb': {'slot': cfg.get('slot', 'spidey'), 'joints': {k: np.round(v, 5).tolist() for k, v in W.items() if k in JOINTS},
                      'eye': J['eye'], 'headCenter': J['headCenter'], 'headTop': J['headTop']},
        'source': j['asset'].get('extras', {})}},
        'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'accessors': [], 'bufferViews': [], 'buffers': [],
        'skins': [], 'materials': [], 'textures': j.get('textures', []), 'images': [], 'samplers': j.get('samplers', [])}
    if 'extensionsUsed' in j: out['extensionsUsed'] = [e for e in j['extensionsUsed']]
    blob = bytearray()
    def add_view(data, target=None):
        while len(blob) % 4: blob.append(0)
        v = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
        if target: v['target'] = target
        blob.extend(data); out['bufferViews'].append(v); return len(out['bufferViews']) - 1
    def add_acc(arr, typ, comp, target=None, minmax=False, normalized=False):
        a = {'bufferView': add_view(arr.tobytes(), target), 'componentType': comp, 'count': len(arr), 'type': typ}
        if normalized: a['normalized'] = True
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        out['accessors'].append(a); return len(out['accessors']) - 1
    for im in j.get('images', []):
        bv = j['bufferViews'][im['bufferView']]
        data = bin_[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        out['images'].append({'bufferView': add_view(data), 'mimeType': im.get('mimeType', 'image/png')})
    matmap = {}
    for p in prims:
        if p[4] not in matmap:
            matmap[p[4]] = len(out['materials']); out['materials'].append(j['materials'][p[4]] if 'materials' in j else {})
    # skeleton nodes (local TRS from the bind frames)
    node_of = {}
    for b in JOINTS:
        node_of[b] = len(out['nodes']); out['nodes'].append({'name': b, 'children': []})
    for b in JOINTS:
        nd = out['nodes'][node_of[b]]
        if b == 'pivot': nd['translation'] = W['pivot'].tolist(); nd['rotation'] = [0, 0, 0, 1]; continue
        pr = PARENT[b]; Rp = R[pr]
        nd['translation'] = (Rp.T @ (W[b] - W[pr])).tolist()
        nd['rotation'] = quat_from_matrix(Rp.T @ R[b]).tolist()
        out['nodes'][node_of[pr]]['children'].append(node_of[b])
    for nd in out['nodes']:
        if not nd['children']: del nd['children']
    IBM = []
    for b in JOINTS:
        M = np.eye(4); M[:3, :3] = R[b]; M[:3, 3] = W[b]; IBM.append(np.linalg.inv(M).T.reshape(-1))
    ibm_acc = add_acc(np.array(IBM, np.float32), 'MAT4', 5126)
    out['skins'].append({'joints': [node_of[b] for b in JOINTS], 'inverseBindMatrices': ibm_acc, 'skeleton': node_of['pivot']})
    mesh = {'name': 'body', 'primitives': []}
    for k, p in enumerate(prims):
        sl = slice(offs[k], offs[k + 1])
        attrs = {'POSITION': add_acc(p[0].astype(np.float32), 'VEC3', 5126, 34962, True),
                 'NORMAL': add_acc(p[1].astype(np.float32), 'VEC3', 5126, 34962),
                 'TEXCOORD_0': add_acc(p[2].astype(np.float32), 'VEC2', 5126, 34962),
                 'JOINTS_0': add_acc(SI[sl].astype(np.uint8), 'VEC4', 5121, 34962),
                 'WEIGHTS_0': add_acc(SW[sl], 'VEC4', 5126, 34962)}
        idx = p[3].astype(np.uint32 if len(p[0]) > 65535 else np.uint16)
        mesh['primitives'].append({'attributes': attrs, 'indices': add_acc(idx, 'SCALAR', 5125 if idx.dtype == np.uint32 else 5123, 34963), 'material': matmap[p[4]]})
    out['meshes'].append(mesh)
    out['nodes'].append({'name': 'body', 'mesh': 0, 'skin': 0})
    out['scenes'][0]['nodes'] = [node_of['pivot'], len(out['nodes']) - 1]
    if not out['samplers']: del out['samplers']
    out['buffers'] = [{'byteLength': len(blob)}]
    js = json.dumps(out, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    while len(blob) % 4: blob.append(0)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    open(dst, 'wb').write(glb)
    print('flip', flip, 'scale', round(s, 4), 'prims', len(prims), 'verts', len(P), 'tris', len(F), 'bytes', len(glb))
    json.dump(J, open(dst + '.joints.json', 'w'))
    json.dump({'P': np.round(Pw, 4).ravel().tolist(), 'F': Fw.ravel().tolist()}, open(dst + '.mesh.json', 'w'))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {})
