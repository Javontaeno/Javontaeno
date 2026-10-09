# Body bake pipeline

Turns an unrigged, untextured base-mesh sculpt into a skinned body the game can animate and paint.

1. `glb_extract.cjs in.glb soup.bin` (or `usd_extract.py in.usdz raw.npz` for USDZ): bake the meshes to world space.
2. `soup_weld.py soup.bin raw.npz 0.0002`: weld the triangle soup into an indexed mesh.
3. `decimate.py raw.npz body.json 30000 [height]`: reduce to a game-friendly triangle count, feet on y=0, facing +z.
4. `fit_joints.py body.json joints.json '<cfg json>'`: place the game's joints by slicing cross-section contours (see `cfg_*.json` for per-body overrides).
5. `bake_body.py body.json joints.json out/<name>`: compute skin weights, split into the painter parts, generate part UVs, and write `<name>.json` + `<name>.bin`.
6. `node tools/pack_bodies.mjs out <name>...`: embed the bodies in `src/assets/bodies.js` (needs `out/credits.json`).

Python needs `numpy`, `fast-simplification` and (for USDZ) `usd-core`. Only bake bodies whose licence allows modification and redistribution.
