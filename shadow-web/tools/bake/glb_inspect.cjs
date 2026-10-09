// Read a GLB's JSON chunk and summarise it (no code from the file is executed).
const fs = require('fs');
const buf = fs.readFileSync(process.argv[2]);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
const jlen = buf.readUInt32LE(12);
const j = JSON.parse(buf.slice(20, 20 + jlen).toString('utf8'));
console.log('asset', JSON.stringify(j.asset));
console.log('extensionsUsed', j.extensionsUsed);
console.log('scenes', j.scenes?.length, 'nodes', j.nodes?.length, 'meshes', j.meshes?.length, 'skins', j.skins?.length, 'anims', j.animations?.length, 'materials', j.materials?.length, 'textures', j.textures?.length, 'images', j.images?.length);
let tris = 0;
for (const m of j.meshes || []) for (const p of m.primitives) {
  const a = Object.keys(p.attributes).join(',');
  const n = p.indices !== undefined ? j.accessors[p.indices].count / 3 : j.accessors[p.attributes.POSITION].count / 3;
  tris += n;
  const pos = j.accessors[p.attributes.POSITION];
  console.log(' mesh', m.name, 'attrs', a, 'tris', n, 'verts', pos.count, 'min', pos.min, 'max', pos.max, 'mat', p.material, 'mode', p.mode);
}
console.log('total tris', tris);
for (const s of j.skins || []) console.log('skin joints', s.joints.length, s.joints.slice(0, 80).map((i) => j.nodes[i].name).join(', '));
for (const n of (j.nodes || []).slice(0, 30)) console.log(' node', n.name, n.mesh !== undefined ? 'mesh' + n.mesh : '', n.skin !== undefined ? 'skin' + n.skin : '', n.children ? 'children' + n.children.length : '', n.rotation ? 'rot' + n.rotation : '', n.scale ? 'scale' + n.scale : '', n.translation ? 't' + n.translation.map((v) => v.toFixed(3)) : '');
for (const m of j.materials || []) console.log(' material', JSON.stringify(m).slice(0, 300));
for (const im of j.images || []) console.log(' image', im.name, im.mimeType, im.bufferView !== undefined ? j.bufferViews[im.bufferView].byteLength + ' bytes' : im.uri);
