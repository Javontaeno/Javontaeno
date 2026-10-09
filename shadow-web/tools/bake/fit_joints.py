# Fit the game's joint layout (JOINTS in character.js) to a normalised A-pose body:
# feet on y=0, facing +z, character's left = +x.
import json, sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contours import contours

def slab(P, y, h=0.012):
    return P[np.abs(P[:, 1] - y) < h]

def fit(P, F, o=None):
    o = o or {}
    H = P[:, 1].max()
    J = {}
    # crotch: lowest height where there's mesh right on the centre line
    crotch = o.get('crotch')
    for y in ([] if crotch else np.arange(0.3, 1.2, 0.004)):
        s = slab(P, y, 0.004)
        if len(s) and (np.abs(s[:, 0]) < 0.012).any(): crotch = y; break
    # legs: centroids of each leg's cross-section
    def leg_c(y, side):
        loops = [l for l in contours(P, F, y) if l[:, 0].mean() * side > 0.01 and abs(l[:, 0].mean()) < 0.35]
        if not loops: return np.array([side * 0.1, 0.0])
        l = max(loops, key=len)
        return np.array([l[:, 0].mean(), l[:, 2].mean()])
    hipY = crotch + o.get('hipAbove', 0.07)
    for sd, side in (('L', 1), ('R', -1)):
        c = leg_c(crotch - 0.08, side)
        J['th' + sd] = [c[0] * 0.9, hipY, c[1]]
        ankY = o.get('ankle', 0.075)
        ca = leg_c(ankY + 0.03, side)
        J['ft' + sd] = [ca[0], ankY, ca[1] - 0.01]
        kY = ankY + (hipY - ankY) * 0.47
        ck = leg_c(kY, side)
        J['kn' + sd] = [ck[0], kY, ck[1] + 0.005]
    torso = lambda y: slab(P, y, 0.01)[np.abs(slab(P, y, 0.01)[:, 0]) < 0.12]
    zc = lambda y: torso(y)[:, 2].mean() if len(torso(y)) else 0.0
    # arms: trace each arm's centre line up from the wrist until it merges with the torso (the armpit),
    # then extrapolate the upper-arm line to the shoulder joint
    for sd, side in (('L', 1), ('R', -1)):
        A = P[(P[:, 0] * side > o.get('armX', 0.27)) & (P[:, 1] > hipY - 0.15)]
        # arm axis from the far arm (forearm + hand), then walk planes perpendicular to it from the hand inwards
        c0 = A.mean(0); _, _, vt = np.linalg.svd(A - c0); ax = vt[0]
        if ax[0] * side < 0: ax = -ax                      # pointing out towards the hand
        tip = A[np.argmax(A @ ax)]
        line, armpit, prev, per = [], None, None, []
        t0 = tip @ ax - o.get('handH', 0.2)
        for t in np.arange(t0, t0 - 1.0, -0.01):
            loops = contours(P, F, t, ax)
            if not loops: continue
            cand = min(loops, key=lambda l: np.linalg.norm(l.mean(0) - (prev if prev is not None else tip)))
            cen = cand.mean(0); L = np.linalg.norm(cand - cen, axis=1).mean()   # loop radius (points are unordered)
            if o.get('debug'): print(sd, round(float(t), 3), np.round(cen, 3), round(float(L), 3), len(loops))
            if prev is not None and (np.linalg.norm(cen - prev) > 0.04 or (len(per) > 3 and L > 1.8 * np.median(per[-12:]))):
                armpit = cen; break                          # the slice has run into the torso
            line.append(cen); per.append(L); prev = cen
        line = np.array(line)
        up = line[-max(3, len(line) // 3):]           # upper arm section
        c = up.mean(0); _, _, vt = np.linalg.svd(up - c); d = vt[0]
        if d @ ax > 0: d = -d                          # pointing in towards the shoulder
        sh = line[-1] + d * o.get('shoulderIn', 0.09)
        sh[0] += side * o.get('shoulderDx', 0.0); sh[1] += o.get('shoulderDy', 0.0); sh[2] += o.get('shoulderDz', 0.0)
        hand = o.get('hand', 0.19)
        tipdir = (line[0] - tip); tipdir /= np.linalg.norm(tipdir)
        wrist = tip + tipdir * hand
        cum = np.r_[0, np.cumsum(np.linalg.norm(np.diff(np.vstack([sh, line[::-1], wrist]), axis=0), axis=1))]
        path = np.vstack([sh, line[::-1], wrist])
        t = cum[-1] * o.get('elbowK', 0.53)
        i = np.searchsorted(cum, t); f = (t - cum[i - 1]) / max(1e-6, cum[i] - cum[i - 1])
        elbow = path[i - 1] + (path[i] - path[i - 1]) * f
        fing = wrist - tipdir * o.get('palm', 0.09)
        J['ar' + sd] = sh.tolist(); J['el' + sd] = elbow.tolist(); J['ha' + sd] = wrist.tolist(); J['fi' + sd] = fing.tolist()
        J['tip' + sd] = tip.tolist()
    shY = (J['arL'][1] + J['arR'][1]) / 2
    # head: everything above the chin
    chin = H - o.get('headH', 0.235)
    Hd = P[P[:, 1] > chin]
    hc = (Hd.min(0) + Hd.max(0)) / 2
    J['hips'] = [0, hipY + 0.035, zc(hipY + 0.035)]
    tl = shY - (hipY + 0.035)                            # hips → shoulders, so torso joints scale with the body
    J['spine'] = [0, hipY + 0.035 + tl * 0.25, zc(hipY + 0.035 + tl * 0.25)]
    J['chest'] = [0, hipY + 0.035 + tl * 0.6, zc(hipY + 0.035 + tl * 0.6)]
    nY = shY + o.get('neckAbove', 0.04)
    J['neck'] = [0, nY, zc(nY) - 0.01]
    J['head'] = [0, hc[1] - 0.09, hc[2] - 0.012]
    J['headCenter'] = hc.tolist(); J['headTop'] = float(H)
    # face front at eye level for the hero's lenses
    eyeY = hc[1] + o.get('eyeDy', 0.005)
    e = P[(np.abs(P[:, 1] - eyeY) < 0.008) & (np.abs(np.abs(P[:, 0]) - 0.035) < 0.008)]
    J['eye'] = [0.035, float(eyeY), float(e[:, 2].max()) if len(e) else hc[2] + 0.1]
    J['crotch'] = float(crotch)
    # hand-placed overrides (left side given, right side mirrored)
    for k, v in (o.get('set') or {}).items():
        J[k] = list(v)
        if k.endswith('L'): J[k[:-1] + 'R'] = [-v[0], v[1], v[2]]
    return {k: (np.round(np.array(v, dtype=float), 4).tolist() if isinstance(v, (list, np.ndarray)) else v) for k, v in J.items()}

if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); P = np.array(d['P']).reshape(-1, 3); F = np.array(d['F']).reshape(-1, 3)
    o = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
    J = fit(P, F, o)
    json.dump(J, open(sys.argv[2], 'w'), indent=1)
    for k, v in J.items(): print(k, v)
