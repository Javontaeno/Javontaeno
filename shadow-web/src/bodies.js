import * as THREE from 'three';
import { BODIES } from './assets/bodies.js';

// Sculpted body meshes (baked by tools/bake_body.py): one skinned mesh per body, split into the same parts the
// canvas painters use (chest, upperArm, shin...), with UVs laid out like the procedural parts so every costume works.

export const BODY_PARTS = ['chest', 'abdomen', 'pelvis', 'upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot', 'head', 'neck'];
export const BONE_ORDER = ['pivot', 'hips', 'spine', 'chest', 'neck', 'head', 'arL', 'elL', 'haL', 'arR', 'elR', 'haR',
  'thL', 'knL', 'ftL', 'thR', 'knR', 'ftR', 'fiL', 'fiR'];
const PARENT = { hips: 'pivot', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', arL: 'chest', elL: 'arL', haL: 'elL', fiL: 'haL',
  arR: 'chest', elR: 'arR', haR: 'elR', fiR: 'haR', thL: 'hips', knL: 'thL', ftL: 'knL', thR: 'hips', knR: 'thR', ftR: 'knR' };
const CHILD = { ar: 'el', el: 'ha', ha: 'fi', th: 'kn', kn: 'ft' };
const DOWN = new THREE.Vector3(0, -1, 0);

// Which sculpted body each build uses, and how much to thicken or slim each region of it.
export const BODY_FOR = {
  hero: { body: 'male' },
  lean: { body: 'male', torso: 0.97, arms: 0.95, legs: 0.97 },
  thug: { body: 'male', torso: 1.06, belly: 1.12, arms: 1.0, legs: 1.04 },
  symbiote: { body: 'male', torso: 1.0, arms: 1.02 },
  stocky: { body: 'male', torso: 1.08, arms: 1.12, legs: 1.06 },
  old: { body: 'male', torso: 0.98, belly: 1.1, arms: 0.9, legs: 0.94 },
  female: { body: 'female' },
  big: { body: 'bulky', torso: 0.92, arms: 0.9, legs: 0.95 },
  brute: { body: 'bulky' },
  venom: { body: 'bulky', torso: 0.98, arms: 1.0 },
  rhino: { body: 'bulky', torso: 1.08, belly: 1.15, arms: 1.05, legs: 1.08 },
  kingpin: { body: 'heavy' },
};

const decoded = {};
function decode(name) {
  if (decoded[name]) return decoded[name];
  const src = BODIES[name];
  if (!src) return null;
  const raw = atob(src.data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const buf = bytes.buffer, B = src.meta.buffers;
  const view = (k, T) => new T(buf, B[k][0], B[k][2]);
  const out = {
    meta: src.meta,
    position: view('position', Float32Array), normal: view('normal', Int8Array), uv: view('uv', Float32Array),
    skinIndex: view('skinIndex', Uint8Array), skinWeight: view('skinWeight', Uint8Array),
    index: B.index[1] === 'uint32' ? view('index', Uint32Array) : view('index', Uint16Array),
  };
  // bind-pose bone frames, built exactly like the baker builds them
  const W = {}, R = { pivot: new THREE.Quaternion() };
  for (const [k, v] of Object.entries(src.meta.joints)) W[k] = new THREE.Vector3(...v);
  W.pivot = new THREE.Vector3(0, 1.05, 0);
  for (const b of BONE_ORDER.slice(1)) {
    const Rp = R[PARENT[b]];
    const c = CHILD[b.slice(0, 2)];
    if (c) {
      const d = W[c + b[2]].clone().sub(W[b]).normalize().applyQuaternion(Rp.clone().invert());
      R[b] = Rp.clone().multiply(new THREE.Quaternion().setFromUnitVectors(DOWN, d));
    } else R[b] = Rp.clone();
  }
  out.W = W; out.R = R;
  return (decoded[name] = out);
}

export function hasBody(name) { return !!BODIES[name]; }

// Geometry for a build: the body's mesh with each region scaled out from its bone axis.
const geoCache = {};
export function bodyGeometry(key) {
  const cfg = BODY_FOR[key];
  if (!cfg || !hasBody(cfg.body)) return null;
  if (geoCache[key]) return geoCache[key];
  const d = decode(cfg.body);
  const pos = new Float32Array(d.position);
  const scale = { chest: cfg.torso, abdomen: cfg.belly || cfg.torso, pelvis: cfg.torso, upperArm: cfg.arms, foreArm: cfg.arms, thigh: cfg.legs, shin: cfg.legs, neck: cfg.torso };
  const frameOf = { chest: 'chest', abdomen: 'spine', pelvis: 'hips', neck: 'neck', upperArm: 'ar', foreArm: 'el', thigh: 'th', shin: 'kn' };
  const v = new THREE.Vector3(), a = new THREE.Vector3(), ax = new THREE.Vector3();
  for (const g of d.meta.groups) {
    const k = scale[g.part];
    if (!k || k === 1) continue;
    const seen = new Set();
    for (let i = g.start; i < g.start + g.count; i++) {
      const vi = d.index[i];
      if (seen.has(vi)) continue;
      seen.add(vi);
      v.fromArray(pos, vi * 3);
      let b = frameOf[g.part];
      if (b.length === 2) b += v.x > 0 ? 'L' : 'R';
      a.copy(d.W[b]); ax.copy(DOWN).applyQuaternion(d.R[b]);
      if (['chest', 'abdomen', 'pelvis', 'neck'].includes(g.part)) ax.set(0, 1, 0);
      // push away from the bone's axis line
      const t = v.clone().sub(a).dot(ax);
      const onAxis = a.clone().addScaledVector(ax, t);
      v.sub(onAxis).multiplyScalar(k).add(onAxis);
      v.toArray(pos, vi * 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3, true));
  geo.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(d.skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(d.skinWeight, 4, true));
  geo.setIndex(new THREE.BufferAttribute(d.index, 1));
  for (const g of d.meta.groups) geo.addGroup(g.start, g.count, BODY_PARTS.indexOf(g.part));
  if (Object.values(scale).some((k) => k && k !== 1)) geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return (geoCache[key] = { geo, meta: d.meta, W: d.W, R: d.R, body: cfg.body });
}

// A fresh skeleton in bind pose: bones named like the procedural rig's joints.
export function bodySkeleton(key) {
  const g = bodyGeometry(key);
  const bones = {};
  for (const b of BONE_ORDER) { bones[b] = new THREE.Bone(); bones[b].name = b; }
  for (const b of BONE_ORDER) {
    const bone = bones[b];
    if (b === 'pivot') { bone.position.copy(g.W.pivot); continue; }
    const p = PARENT[b], Rp = g.R[p];
    bone.position.copy(g.W[b]).sub(g.W[p]).applyQuaternion(Rp.clone().invert());
    bone.quaternion.copy(Rp.clone().invert().multiply(g.R[b]));
    bones[p].add(bone);
  }
  return { bones, list: BONE_ORDER.map((b) => bones[b]), root: bones.pivot, geo: g };
}
