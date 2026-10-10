# Make a heavy-set body (Kingpin) from the lean male: fat layers pushed out along the normals,
# a big belly and softened muscle definition. usage: morph_heavy.py body.json joints.json out.json
import json, sys, numpy as np

d = json.load(open(sys.argv[1])); P = np.array(d['P'], dtype=float).reshape(-1, 3); F = np.array(d['F'], dtype=np.int64).reshape(-1, 3)
J = {k: np.array(v) for k, v in json.load(open(sys.argv[2])).items() if isinstance(v, list) and len(v) == 3}

fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
N = np.zeros_like(P); [np.add.at(N, F[:, k], fn) for k in range(3)]
N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12

def blob(c, r, amp):
    q = (P - c) / r
    return amp * np.exp(-(q ** 2).sum(1))

def seg_dist(a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1), t

x, y, z = P[:, 0], P[:, 1], P[:, 2]
hipY, shY = J['hips'][1], (J['arL'][1] + J['arR'][1]) / 2
# keep hands, feet and the face as they are
keep = np.ones(len(P))
for sd in 'LR':
    beyond = ((P - J['ha' + sd]) @ ((J['ha' + sd] - J['el' + sd]) / np.linalg.norm(J['ha' + sd] - J['el' + sd]))) > -0.02
    keep[beyond & (np.abs(x) > 0.15)] = 0
keep[y < 0.12] = 0
face = (y > J['head'][1] + 0.04) & (z > J['headCenter'][2])
keep[face] *= 0.15

smooth = lambda v, a, b: np.clip((v - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((v - a) / (b - a), 0, 1))
D = np.zeros_like(P)
# torso: inflate horizontally away from the spine line, most at the belly and front
zc = J['spine'][2]
rad = np.c_[x, np.zeros(len(P)), z - zc]; rl = np.linalg.norm(rad, axis=1, keepdims=True) + 1e-9; rad /= rl
front = smooth(rad[:, 2], -0.6, 1.0)
wT = smooth(y, hipY - 0.18, hipY - 0.02) * (1 - smooth(y, shY - 0.02, shY + 0.1)) * (1 - smooth(np.abs(x), 0.22, 0.3))
bellyY = hipY + 0.12
D += rad * (wT * (0.045 + 0.05 * front * np.exp(-((y - bellyY) / 0.16) ** 2)))[:, None]
D[:, 2] += wT * 0.13 * front ** 1.5 * np.exp(-((y - bellyY) / 0.15) ** 2) * np.exp(-(x / 0.2) ** 2)
D[:, 0] += wT * 0.05 * np.sign(x) * np.exp(-((y - (hipY + 0.06)) / 0.1) ** 2) * smooth(np.abs(x), 0.05, 0.16)   # love handles
# limbs and neck: inflate away from their bones
def limb(a, b, amp, r):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1); c = a + t[:, None] * ab
    v = P - c; dl = np.linalg.norm(v, axis=1, keepdims=True) + 1e-9
    return v / dl * (amp * np.exp(-(dl[:, 0] / r) ** 2))[:, None]
for sd in 'LR':
    D += limb(J['th' + sd], J['kn' + sd], 0.05, 0.13) * (y > J['kn' + sd][1] - 0.05)[:, None]
    D += limb(J['kn' + sd], J['ft' + sd], 0.015, 0.08)
    D += limb(J['ar' + sd], J['el' + sd], 0.03, 0.1)
    D += limb(J['el' + sd], J['ha' + sd], 0.015, 0.07)
D += limb(J['chest'], J['neck'] + np.array([0, 0.12, 0]), 0.035, 0.12) * (y > shY - 0.05)[:, None]
D[:, 2] += 0.02 * np.exp(-(((P - (J['head'] + np.array([0, 0.0, 0.07]))) / np.array([0.07, 0.04, 0.06])) ** 2).sum(1))   # jowls
D *= keep[:, None]
nb = [[] for _ in range(len(P))]
for a, b, c in F: nb[a] += [b, c]; nb[b] += [a, c]; nb[c] += [a, b]
rows = np.repeat(np.arange(len(P)), [len(n) for n in nb]); cols = np.concatenate([np.array(n, dtype=np.int64) for n in nb]); deg = np.array([max(1, len(n)) for n in nb], float)
for _ in range(40):
    acc = np.zeros_like(D); np.add.at(acc, rows, D[cols])
    D = 0.5 * D + 0.5 * acc / deg[:, None]
dk = np.linalg.norm(D, axis=1)
P2 = P + D
# soften the sculpted muscle definition (not the head, hands or feet)
w = (keep * (~face)).clip(0, 1)[:, None] * 0.6
for _ in range(14):
    acc = np.zeros_like(P2); np.add.at(acc, rows, P2[cols])
    P2 = P2 + w * (acc / deg[:, None] - P2)
json.dump({'P': np.round(P2, 5).ravel().tolist(), 'F': F.ravel().tolist()}, open(sys.argv[3], 'w'))
print('max push', round(float(dk.max()), 3))
