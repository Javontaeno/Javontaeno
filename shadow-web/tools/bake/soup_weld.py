import sys, numpy as np
s = np.fromfile(sys.argv[1], dtype=np.float32).reshape(-1, 3).astype(np.float64)
q = np.round(s / float(sys.argv[3])).astype(np.int64)
_, first, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
P = s[first]; F = inv.reshape(-1).reshape(-1, 3)
F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
print('verts', len(P), 'tris', len(F), 'bbox', P.min(0), P.max(0))
np.savez(sys.argv[2], P=P, F=F)
