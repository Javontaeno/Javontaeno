// Bake every mesh in a GLB to world space and write triangle soup (float32 xyz) for welding.
const fs = require('fs');
const THREE = require('three');
const buf = fs.readFileSync(process.argv[2]);
const jlen = buf.readUInt32LE(12);
const j = JSON.parse(buf.slice(20, 20 + jlen).toString('utf8'));
const binStart = 20 + jlen + 8;
const local = (n) => {
  const m = new THREE.Matrix4();
  if (n.matrix) m.fromArray(n.matrix);
  else m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])));
  return m;
};
const out = [];
const visit = (i, parent) => {
  const n = j.nodes[i], w = parent.clone().multiply(local(n));
  if (n.mesh !== undefined) for (const p of j.meshes[n.mesh].primitives) {
    const acc = j.accessors[p.attributes.POSITION], bv = j.bufferViews[acc.bufferView];
    const off = binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0), stride = bv.byteStride || 12;
    const pos = (k) => new THREE.Vector3(buf.readFloatLE(off + k * stride), buf.readFloatLE(off + k * stride + 4), buf.readFloatLE(off + k * stride + 8)).applyMatrix4(w);
    let idx;
    if (p.indices !== undefined) {
      const ia = j.accessors[p.indices], ibv = j.bufferViews[ia.bufferView], io = binStart + (ibv.byteOffset || 0) + (ia.byteOffset || 0);
      const sz = { 5121: 1, 5123: 2, 5125: 4 }[ia.componentType];
      idx = Array.from({ length: ia.count }, (_, k) => (sz === 4 ? buf.readUInt32LE(io + k * 4) : sz === 2 ? buf.readUInt16LE(io + k * 2) : buf.readUInt8(io + k)));
    } else idx = Array.from({ length: acc.count }, (_, k) => k);
    for (const k of idx) { const v = pos(k); out.push(v.x, v.y, v.z); }
  }
  for (const c of n.children || []) visit(c, w);
};
for (const r of j.scenes[j.scene || 0].nodes) visit(r, new THREE.Matrix4());
fs.writeFileSync(process.argv[3], Buffer.from(new Float32Array(out).buffer));
console.log('triangles', out.length / 9);
