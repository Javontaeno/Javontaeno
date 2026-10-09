# Extract every body mesh from a USD stage in world space, weld shared vertices, save as npz.
import sys, numpy as np
from pxr import Usd, UsdGeom
stage = Usd.Stage.Open(sys.argv[1])
P, F = [], []
off = 0
cache = UsdGeom.XformCache()
for p in stage.Traverse():
    if p.GetTypeName() != 'Mesh' or 'Sphere' in str(p.GetPath()): continue
    m = UsdGeom.Mesh(p)
    pts = np.array(m.GetPointsAttr().Get(), dtype=np.float64)
    M = np.array(cache.GetLocalToWorldTransform(p), dtype=np.float64)  # row-vector convention
    pts = np.c_[pts, np.ones(len(pts))] @ M
    pts = pts[:, :3]
    cnt = np.array(m.GetFaceVertexCountsAttr().Get()); idx = np.array(m.GetFaceVertexIndicesAttr().Get())
    assert (cnt == 3).all(), set(cnt)
    F.append(idx.reshape(-1, 3) + off); P.append(pts); off += len(pts)
P = np.vstack(P); F = np.vstack(F)
# weld by quantised position
q = np.round(P / 0.01).astype(np.int64)
_, first, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
P2 = P[first]; F2 = inv.reshape(-1)[F]
F2 = F2[(F2[:, 0] != F2[:, 1]) & (F2[:, 1] != F2[:, 2]) & (F2[:, 0] != F2[:, 2])]
print('raw verts', len(P), 'welded', len(P2), 'tris', len(F2))
print('bbox', P2.min(0), P2.max(0))
np.savez(sys.argv[2], P=P2, F=F2)
