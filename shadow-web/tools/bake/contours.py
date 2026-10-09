import numpy as np

def contours(P, F, y, n=None):
    """Cross-section of a triangle mesh with the plane {p : p.n = y} (n defaults to +Y).
    Returns a list of loops, each an (k,3) array of points, separated by mesh connectivity."""
    d = (P[:, 1] if n is None else P @ n) - y
    s = d[F] > 0
    cross = s.any(1) & ~s.all(1)
    T = F[cross]
    parent = {}
    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    def union(a, b): parent[find(a)] = find(b)
    pts = {}
    for tri in T:
        es = []
        for a, b in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])):
            if (d[a] > 0) != (d[b] > 0):
                k = (min(a, b), max(a, b))
                if k not in pts:
                    t = d[a] / (d[a] - d[b]); pts[k] = P[a] + (P[b] - P[a]) * t
                es.append(k)
        if len(es) == 2: union(es[0], es[1])
    groups = {}
    for k, p in pts.items(): groups.setdefault(find(k), []).append(p)
    return [np.array(g) for g in groups.values() if len(g) >= 3]
