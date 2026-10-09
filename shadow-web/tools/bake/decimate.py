import sys, json, numpy as np, fast_simplification as fs
d = np.load(sys.argv[1]); P, F = d['P'], d['F']
target = int(sys.argv[3]); height = float(sys.argv[4]) if len(sys.argv) > 4 else 1.83
if target < len(F): P2, F2 = fs.simplify(P.astype(np.float32), F.astype(np.int32), target_reduction=1 - target / len(F))
else: P2, F2 = P.astype(np.float32), F.astype(np.int32)
# normalise: feet on y=0, 1.0 unit = 1 m with the body 1.83 m tall, centred in x/z
h = P2[:, 1].max() - P2[:, 1].min()
s = height / h
P2 = (P2 - [ (P2[:,0].max()+P2[:,0].min())/2, P2[:,1].min(), (P2[:,2].max()+P2[:,2].min())/2 ]) * s
print('height', height, 'tris', len(F2), 'verts', len(P2), 'scale', s, 'bbox', P2.min(0), P2.max(0))
json.dump({'P': np.round(P2, 5).ravel().tolist(), 'F': F2.ravel().tolist()}, open(sys.argv[2], 'w'))
