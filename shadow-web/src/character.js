import * as THREE from 'three';
import { GLSL_NOISE, damp, lerp, clamp, smooth, rng } from './util.js';

// ---------------------------------------------------------------------------
// Joints & poses
// ---------------------------------------------------------------------------
export const JOINTS = ['pivot', 'hips', 'spine', 'chest', 'neck', 'head', 'arL', 'elL', 'haL', 'arR', 'elR', 'haR',
  'thL', 'knL', 'ftL', 'thR', 'knR', 'ftR', 'fiL', 'fiR'];

export class Pose {
  constructor() {
    this.v = {};
    for (const j of JOINTS) this.v[j] = [0, 0, 0];
    this.rootY = 0;
  }
  reset() { for (const j of JOINTS) { const a = this.v[j]; a[0] = a[1] = a[2] = 0; } this.rootY = 0; return this; }
  set(j, x, y, z) { const a = this.v[j]; a[0] = x; a[1] = y; a[2] = z; return this; }
  add(j, x, y, z) { const a = this.v[j]; a[0] += x; a[1] += y; a[2] += z; return this; }
  apply(obj) { for (const j in obj) { if (j === 'rootY') this.rootY = obj[j]; else this.set(j, ...obj[j]); } return this; }
  copy(o) { for (const j of JOINTS) { const a = this.v[j], b = o.v[j]; a[0] = b[0]; a[1] = b[1]; a[2] = b[2]; } this.rootY = o.rootY; return this; }
  lerp(o, t) {
    for (const j of JOINTS) { const a = this.v[j], b = o.v[j]; a[0] += (b[0] - a[0]) * t; a[1] += (b[1] - a[1]) * t; a[2] += (b[2] - a[2]) * t; }
    this.rootY += (o.rootY - this.rootY) * t;
    return this;
  }
}

// --- base poses ------------------------------------------------------------
export const P = {
  idle(p, t) {
    const b = Math.sin(t * 1.7);
    p.set('spine', 0.04 + b * 0.012, 0, 0).set('chest', 0.02 + b * 0.015, 0, 0).set('head', -0.04, 0, 0);
    p.set('arL', 0.05, 0.1, 0.13).set('elL', -0.28, 0, 0).set('arR', 0.05, -0.1, -0.13).set('elR', -0.28, 0, 0);
    p.set('thL', -0.04, 0.12, 0.07).set('thR', -0.04, -0.12, -0.07).set('knL', 0.08, 0, 0).set('knR', 0.08, 0, 0);
    p.set('ftL', -0.04, 0, -0.07).set('ftR', -0.04, 0, 0.07);
    p.set('fiL', 0, 0, -0.5).set('fiR', 0, 0, 0.5);
    p.rootY = -0.01 + b * 0.004;
  },
  stance(p, t) {
    // crouched fighting stance, fists up, slight bounce
    const b = Math.sin(t * 5.0);
    p.set('spine', 0.22, 0, 0).set('chest', 0.06, 0.32, 0).set('neck', -0.05, -0.15, 0).set('head', -0.12, -0.15, 0);
    p.set('hips', 0, -0.3, 0);
    p.set('arL', -1.05, 0.25, 0.42).set('elL', -1.95, 0, 0).set('arR', -0.75, -0.2, -0.35).set('elR', -2.15, 0, 0);
    p.set('thL', -0.55, 0.35, 0.18).set('knL', 0.85, 0, 0).set('thR', -0.05, 0.1, -0.2).set('knR', 0.6, 0, 0);
    p.set('ftL', -0.2, 0, -0.1).set('ftR', -0.4, 0, 0.15);
    p.set('fiL', 0, 0, -1.6).set('fiR', 0, 0, 1.6);
    p.rootY = -0.16 + b * 0.012;
  },
  run(p, ph, amt, sprint = 0) {
    const s = Math.sin(ph), c = Math.cos(ph);
    const a = amt;
    p.set('spine', 0.18 * a + sprint * 0.35, 0, 0).set('chest', 0.05, -s * 0.18 * a, 0).set('head', -0.15 * a - sprint * 0.25, s * 0.1 * a, 0);
    p.set('hips', 0, s * 0.12 * a, 0);
    p.set('thL', -s * 0.85 * a - 0.1 * a, 0, 0.03).set('thR', s * 0.85 * a - 0.1 * a, 0, -0.03);
    p.set('knL', (0.25 + Math.max(0, -c) * 1.4) * a, 0, 0).set('knR', (0.25 + Math.max(0, c) * 1.4) * a, 0, 0);
    p.set('ftL', -0.25 * a * Math.max(0, s), 0, 0).set('ftR', -0.25 * a * Math.max(0, -s), 0, 0);
    if (sprint > 0.5) {
      // the classic arms-swept-back hero sprint
      p.set('arL', 0.9 + s * 0.15, 0, 0.35).set('arR', 0.9 - s * 0.15, 0, -0.35);
      p.set('elL', -0.35, 0, 0).set('elR', -0.35, 0, 0);
      p.set('fiL', 0, 0, -0.3).set('fiR', 0, 0, 0.3);
    } else {
      p.set('arL', s * 0.85 * a, 0, 0.12).set('arR', -s * 0.85 * a, 0, -0.12);
      p.set('elL', (-0.6 - 0.6 * Math.max(0, s)) * a, 0, 0).set('elR', (-0.6 - 0.6 * Math.max(0, -s)) * a, 0, 0);
      p.set('fiL', 0, 0, -1.2).set('fiR', 0, 0, 1.2);
    }
    p.rootY = (-Math.abs(c) * 0.07 - 0.02) * a;
  },
  jump(p, k) {
    // k: 0 = launch, 1 = tucked apex
    p.set('spine', 0.15 + k * 0.25, 0, 0);
    p.set('thL', -0.6 - k * 0.9, 0, 0.1).set('thR', -0.3 - k * 1.0, 0, -0.1);
    p.set('knL', 0.9 + k * 1.2, 0, 0).set('knR', 0.5 + k * 1.5, 0, 0);
    p.set('arL', -0.4 - k * 0.6, 0, 0.6).set('arR', -1.8 + k * 0.4, 0, -0.3);
    p.set('elL', -0.8, 0, 0).set('elR', -0.4, 0, 0);
    p.set('fiL', 0, 0, -1.2).set('fiR', 0, 0, 1.2);
  },
  fall(p, t) {
    const w = Math.sin(t * 3.0) * 0.12;
    p.set('spine', -0.15, 0, 0).set('head', -0.2, 0, 0);
    p.set('arL', -0.2, 0, 1.25 + w).set('arR', -0.2, 0, -1.25 + w).set('elL', -0.5, 0, 0).set('elR', -0.5, 0, 0);
    p.set('thL', -0.5 + w, 0, 0.18).set('thR', -0.15 - w, 0, -0.18).set('knL', 0.9, 0, 0).set('knR', 0.6, 0, 0);
    p.set('fiL', 0, 0, -0.3).set('fiR', 0, 0, 0.3);
  },
  dive(p, t) {
    const w = Math.sin(t * 9.0) * 0.04;
    p.set('pivot', 1.25, 0, 0).set('spine', -0.1, 0, 0).set('head', -0.6, 0, 0);
    p.set('arL', 0.35, 0, 0.32 + w).set('arR', 0.35, 0, -0.32 - w).set('elL', -0.15, 0, 0).set('elR', -0.15, 0, 0);
    p.set('thL', 0.1, 0, 0.06).set('thR', 0.15, 0, -0.06).set('knL', 0.25, 0, 0).set('knR', 0.4, 0, 0);
    p.set('ftL', 0.5, 0, 0).set('ftR', 0.5, 0, 0);
  },
  swing(p, k, t) {
    // k in [-1,1]: -1 back of arc (legs trailing), +1 front of arc (legs kicked forward)
    const w = Math.sin(t * 4.0) * 0.05;
    p.set('spine', -0.1 - k * 0.15, 0, 0).set('chest', -0.05, 0, 0).set('head', -0.25, 0, 0);
    p.set('arL', -0.3, 0, 0.9 + w).set('elL', -0.9, 0, 0);
    p.set('thL', -0.4 - k * 0.7, 0, 0.12).set('knL', 0.5 + Math.max(0, k) * 0.9, 0, 0);
    p.set('thR', -0.1 - k * 0.9, 0, -0.1).set('knR', 0.2 + Math.max(0, -k) * 0.6 + Math.max(0, k) * 1.4, 0, 0);
    p.set('ftL', 0.3, 0, 0).set('ftR', 0.3, 0, 0);
    p.set('fiL', 0, 0, -0.6).set('fiR', 0, 0, 1.6);
  },
  wall(p, ph, amt) {
    const s = Math.sin(ph), c = Math.cos(ph);
    p.set('spine', 0.25, 0, 0).set('chest', 0.15, 0, 0).set('head', -0.75, 0, 0);
    p.set('arL', -2.3 - s * 0.55 * amt, 0, 0.55).set('elL', -0.6 - Math.max(0, s) * 0.8 * amt, 0, 0);
    p.set('arR', -2.3 + s * 0.55 * amt, 0, -0.55).set('elR', -0.6 - Math.max(0, -s) * 0.8 * amt, 0, 0);
    p.set('thL', -0.7 + s * 0.6 * amt, 0, 0.55).set('knL', 1.4 - c * 0.5 * amt, 0, 0);
    p.set('thR', -0.7 - s * 0.6 * amt, 0, -0.55).set('knR', 1.4 + c * 0.5 * amt, 0, 0);
    p.set('ftL', -0.6, 0, 0).set('ftR', -0.6, 0, 0);
    p.set('fiL', 0, 0, -0.4).set('fiR', 0, 0, 0.4);
    p.rootY = -0.15;
  },
  zip(p) {
    p.set('pivot', 0.9, 0, 0).set('spine', -0.15, 0, 0).set('head', -0.7, 0, 0);
    p.set('arL', 0.6, 0, 0.4).set('elL', -0.3, 0, 0);
    p.set('thL', 0.0, 0, 0.1).set('knL', 0.4, 0, 0).set('thR', -0.3, 0, -0.1).set('knR', 1.2, 0, 0);
    p.set('fiR', 0, 0, 1.6);
  },
  perch(p, t) {
    const b = Math.sin(t * 1.5) * 0.02;
    p.set('spine', 0.75 + b, 0, 0).set('chest', 0.2, 0, 0).set('head', -0.85, 0, 0);
    p.set('thL', -1.75, 0.3, 0.55).set('knL', 2.35, 0, 0).set('thR', -1.65, -0.3, -0.55).set('knR', 2.35, 0, 0);
    p.set('ftL', -0.5, 0, -0.3).set('ftR', -0.5, 0, 0.3);
    p.set('arL', -0.55, 0, 0.25).set('elL', -0.2, 0, 0).set('arR', -0.2, 0, -0.65).set('elR', -1.0, 0, 0);
    p.set('fiL', 0, 0, -0.2).set('fiR', 0, 0, 1.4);
    p.rootY = -0.52;
  },
  land(p, k) {
    // the three-point superhero landing
    p.set('spine', 0.75 * k, 0, 0).set('head', -0.75 * k, 0, 0);
    p.set('thL', -1.6 * k, 0, 0.25).set('knL', 2.0 * k, 0, 0).set('ftL', -0.3 * k, 0, 0);
    p.set('thR', 0.15 * k, 0, -0.35).set('knR', 2.3 * k, 0, 0).set('ftR', 0.6 * k, 0, 0);
    p.set('arR', -0.55 * k, 0, -0.35).set('elR', -0.1, 0, 0);
    p.set('arL', 0.4 * k, 0, 0.9 * k).set('elL', -0.3, 0, 0);
    p.set('fiR', 0, 0, 0.2).set('fiL', 0, 0, -1.4);
    p.rootY = -0.5 * k;
  },
  hit(p, k) {
    p.set('spine', -0.35 * k, 0, 0).set('head', -0.45 * k, 0, 0).set('chest', -0.15 * k, 0.2 * k, 0);
    p.set('arL', -0.4, 0, 0.7 * k).set('arR', -0.4, 0, -0.7 * k).set('elL', -0.9, 0, 0).set('elR', -0.9, 0, 0);
    p.set('thL', -0.25, 0, 0.1).set('knL', 0.5, 0, 0).set('thR', 0.15, 0, -0.1).set('knR', 0.4, 0, 0);
    p.rootY = -0.06;
  },
  down(p) {
    // lying on the back
    p.set('pivot', -1.5, 0, 0).set('spine', -0.05, 0, 0).set('head', 0.2, 0.4, 0);
    p.set('arL', -0.3, 0, 1.4).set('arR', -0.2, 0, -1.2).set('elL', -0.5, 0, 0).set('elR', -1.0, 0, 0);
    p.set('thL', -0.2, 0, 0.2).set('knL', 0.6, 0, 0).set('thR', 0, 0, -0.15).set('knR', 0.1, 0, 0);
    p.rootY = -0.88;
  },
  webbed(p, t) {
    const w = Math.sin(t * 14) * 0.04;
    p.set('spine', 0.05 + w, 0, 0).set('arL', 0.05, 0, 0.05).set('arR', 0.05, 0, -0.05);
    p.set('elL', -0.1, 0, 0).set('elR', -0.1, 0, 0).set('thL', 0, 0, 0.02).set('thR', 0, 0, -0.02);
    p.set('head', -0.1 + w * 2, w * 4, 0);
  },
  crawl(p, ph, amt) {
    // hunched symbiote lope
    const s = Math.sin(ph), c = Math.cos(ph);
    p.set('spine', 0.75, 0, 0).set('chest', 0.35, s * 0.2 * amt, 0).set('head', -0.9, 0, 0);
    p.set('arL', -1.1 + s * 0.9 * amt, 0, 0.35).set('arR', -1.1 - s * 0.9 * amt, 0, -0.35);
    p.set('elL', -0.4 - Math.max(0, s) * 0.6, 0, 0).set('elR', -0.4 - Math.max(0, -s) * 0.6, 0, 0);
    p.set('thL', -0.9 - s * 0.7 * amt, 0, 0.25).set('thR', -0.9 + s * 0.7 * amt, 0, -0.25);
    p.set('knL', 1.3 + Math.max(0, c) * 0.6 * amt, 0, 0).set('knR', 1.3 + Math.max(0, -c) * 0.6 * amt, 0, 0);
    p.set('ftL', -0.3, 0, 0).set('ftR', -0.3, 0, 0);
    p.set('fiL', 0, 0, 0.3).set('fiR', 0, 0, -0.3);
    p.rootY = -0.35 - Math.abs(c) * 0.06 * amt;
  },
};

// --- keyframed actions -----------------------------------------------------
// Each action: keys [[t, sparse pose]], applied on top of a base pose. `hit` marks the impact moment.
const sym = (o) => {
  const m = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'rootY') { m.rootY = v; continue; }
    const mk = k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k;
    m[mk] = [v[0], -v[1], -v[2]];
  }
  return m;
};
const mirror = (A) => ({ ...A, keys: A.keys.map(([t, o]) => [t, sym(o)]) });

const ACT = {};
ACT.jab = { hit: 0.32, keys: [
  [0, { arR: [-0.6, 0, -0.45], elR: [-2.3, 0, 0], chest: [0.08, 0.45, 0] }],
  [0.3, { arR: [-1.62, 0, -0.08], elR: [-0.08, 0, 0], chest: [0.12, -0.55, 0], spine: [0.24, 0, 0], arL: [-0.8, 0, 0.45], elL: [-2.1, 0, 0], thR: [-0.15, 0, -0.2], knR: [0.4, 0, 0] }],
  [0.55, { arR: [-1.55, 0, -0.1], elR: [-0.15, 0, 0], chest: [0.12, -0.5, 0], spine: [0.22, 0, 0] }],
  [1, {}],
] };
ACT.cross = mirror(ACT.jab);
ACT.kick = { hit: 0.38, keys: [
  [0, { thR: [-0.4, 0, -0.1], knR: [1.7, 0, 0], spine: [0.1, 0, 0] }],
  [0.35, { thR: [-1.85, 0, -0.1], knR: [0.05, 0, 0], ftR: [0.5, 0, 0], spine: [-0.4, 0, 0], arL: [-0.3, 0, 1.1], arR: [0.4, 0, -0.9], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0], thL: [0.1, 0, 0.1], knL: [0.35, 0, 0], rootY: 0.02 }],
  [0.6, { thR: [-1.7, 0, -0.1], knR: [0.15, 0, 0], spine: [-0.35, 0, 0], arL: [-0.3, 0, 1.0], arR: [0.4, 0, -0.9] }],
  [1, {}],
] };
ACT.spin = { hit: 0.5, keys: [
  [0, { pivot: [0, 0, 0], thR: [-0.3, 0, -0.2], knR: [1.2, 0, 0] }],
  [0.25, { pivot: [0, -2.4, 0], thR: [-0.8, 0, -1.0], knR: [0.8, 0, 0], spine: [-0.15, 0, 0.25], rootY: 0.25 }],
  [0.5, { pivot: [0, -5.0, 0], thR: [-1.45, 0, -1.25], knR: [0.0, 0, 0], ftR: [0.6, 0, 0], spine: [-0.25, 0, 0.45], arL: [-0.2, 0, 1.4], arR: [-0.2, 0, -1.2], thL: [-0.3, 0, 0.2], knL: [0.8, 0, 0], rootY: 0.35 }],
  [0.75, { pivot: [0, -6.28, 0], thR: [-0.6, 0, -0.5], knR: [0.6, 0, 0], rootY: 0.05 }],
  [1, { pivot: [0, -6.28, 0] }],
] };
ACT.upper = { hit: 0.36, keys: [
  [0, { rootY: -0.38, thL: [-1.0, 0, 0.3], knL: [1.6, 0, 0], thR: [-0.9, 0, -0.3], knR: [1.6, 0, 0], spine: [0.5, 0, 0], arR: [0.2, 0, -0.3], elR: [-2.4, 0, 0] }],
  [0.33, { rootY: 0.18, thL: [-0.2, 0, 0.1], knL: [0.2, 0, 0], thR: [0.1, 0, -0.1], knR: [0.4, 0, 0], spine: [-0.25, 0, 0], chest: [-0.1, -0.4, 0], arR: [-3.0, 0, -0.15], elR: [-0.25, 0, 0], arL: [0.3, 0, 0.6] }],
  [0.6, { rootY: 0.1, spine: [-0.2, 0, 0], arR: [-2.9, 0, -0.2], elR: [-0.3, 0, 0], arL: [0.3, 0, 0.6] }],
  [1, {}],
] };
ACT.airA = { hit: 0.3, keys: [
  [0, { pivot: [0.2, 0.4, 0], arR: [-0.5, 0, -0.5], elR: [-2.3, 0, 0], thL: [-1.2, 0, 0.1], knL: [1.8, 0, 0], thR: [-0.8, 0, 0], knR: [1.6, 0, 0] }],
  [0.3, { pivot: [0.3, -0.4, 0], arR: [-1.6, 0, 0], elR: [-0.1, 0, 0], arL: [-0.5, 0, 0.9], thL: [-1.0, 0, 0.1], knL: [1.8, 0, 0], thR: [-0.5, 0, 0], knR: [1.2, 0, 0] }],
  [1, { pivot: [0.2, 0, 0], thL: [-1.0, 0, 0.1], knL: [1.6, 0, 0], thR: [-0.6, 0, 0], knR: [1.4, 0, 0] }],
] };
ACT.airB = { hit: 0.35, keys: [
  [0, { pivot: [-0.3, 0, 0], thR: [-0.6, 0, 0], knR: [2.0, 0, 0], thL: [-1.0, 0, 0], knL: [1.8, 0, 0], arL: [-0.4, 0, 1.0], arR: [-0.4, 0, -1.0] }],
  [0.35, { pivot: [-0.5, 0, 0], thR: [-2.0, 0, 0], knR: [0.0, 0, 0], ftR: [0.6, 0, 0], thL: [-0.5, 0, 0], knL: [1.5, 0, 0], arL: [0.2, 0, 1.2], arR: [0.2, 0, -1.2] }],
  [1, { pivot: [-0.2, 0, 0], thL: [-0.9, 0, 0], knL: [1.6, 0, 0], thR: [-0.9, 0, 0], knR: [1.6, 0, 0] }],
] };
ACT.airC = { hit: 0.55, keys: [
  [0, { pivot: [0, 0, 0], thL: [-1.5, 0, 0], knL: [2.2, 0, 0], thR: [-1.5, 0, 0], knR: [2.2, 0, 0], spine: [0.6, 0, 0] }],
  [0.45, { pivot: [-5.2, 0, 0], thL: [-1.6, 0, 0], knL: [2.3, 0, 0], thR: [-1.6, 0, 0], knR: [2.3, 0, 0], spine: [0.7, 0, 0], arL: [-1.2, 0, 0.3], arR: [-1.2, 0, -0.3] }],
  [0.6, { pivot: [-6.0, 0, 0], thR: [-2.2, 0, 0], knR: [0.0, 0, 0], thL: [-0.4, 0, 0], knL: [1.2, 0, 0], arL: [0.3, 0, 1.2], arR: [0.3, 0, -1.2] }],
  [1, { pivot: [-6.28, 0, 0] }],
] };
ACT.slam = { hit: 0.45, keys: [
  [0, { pivot: [-0.4, 0, 0], arL: [-3.0, 0, 0.35], arR: [-3.0, 0, -0.35], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0], thL: [-1.4, 0, 0.2], knL: [2.0, 0, 0], thR: [-1.4, 0, -0.2], knR: [2.0, 0, 0], spine: [-0.3, 0, 0] }],
  [0.45, { pivot: [0.55, 0, 0], arL: [-0.6, 0, 0.2], arR: [-0.6, 0, -0.2], elL: [-0.1, 0, 0], elR: [-0.1, 0, 0], spine: [0.6, 0, 0], thL: [-1.2, 0, 0.3], knL: [1.8, 0, 0], thR: [-0.4, 0, -0.3], knR: [1.9, 0, 0], rootY: -0.4 }],
  [1, { rootY: -0.2, spine: [0.4, 0, 0] }],
] };
ACT.webStrike = { hit: 0.5, keys: [
  [0, { pivot: [0.7, 0, 0], arR: [-2.6, 0, -0.1], elR: [0, 0, 0], thL: [-0.6, 0, 0], knL: [1.5, 0, 0], thR: [-0.4, 0, 0], knR: [1.2, 0, 0] }],
  [0.5, { pivot: [0.25, 0, 0], thR: [-1.6, 0, 0], knR: [0.0, 0, 0], ftR: [0.5, 0, 0], thL: [-0.3, 0, 0], knL: [1.9, 0, 0], arL: [0.4, 0, 0.9], arR: [0.4, 0, -0.9], spine: [-0.3, 0, 0] }],
  [1, { pivot: [0, 0, 0] }],
] };
ACT.counter = { hit: 0.4, keys: [
  [0, { pivot: [0, 0.8, 0], thR: [-0.3, 0, -0.2], knR: [1.4, 0, 0], spine: [0.3, 0, 0] }],
  [0.4, { pivot: [0, -0.6, 0], thR: [-1.9, 0, -0.5], knR: [0, 0, 0], ftR: [0.5, 0, 0], spine: [-0.45, 0, 0.3], arL: [0, 0, 1.3], arR: [0, 0, -1.3], rootY: 0.1 }],
  [0.7, { pivot: [0, -0.6, 0], thR: [-1.7, 0, -0.5], knR: [0.1, 0, 0], spine: [-0.4, 0, 0.3] }],
  [1, {}],
] };
ACT.finisher = { hit: 0.62, keys: [
  [0, { rootY: -0.3, spine: [0.4, 0, 0], arR: [0.6, 0, -0.4], elR: [-2.0, 0, 0], arL: [0.6, 0, 0.4], elL: [-2.0, 0, 0] }],
  [0.3, { pivot: [-3.0, 0, 0], rootY: 0.8, thL: [-1.6, 0, 0], knL: [2.3, 0, 0], thR: [-1.6, 0, 0], knR: [2.3, 0, 0], spine: [0.6, 0, 0] }],
  [0.62, { pivot: [-6.28, 0, 0], rootY: 0.2, arR: [-1.6, 0, 0], elR: [0, 0, 0], arL: [-1.6, 0, 0], elL: [0, 0, 0], spine: [0.2, 0, 0], thR: [0.2, 0, 0], knR: [0.4, 0, 0], thL: [-0.8, 0, 0], knL: [1.2, 0, 0] }],
  [1, { pivot: [-6.28, 0, 0] }],
] };
ACT.webShot = { hit: 0.25, keys: [
  [0, { arR: [-1.2, 0, -0.2], elR: [-1.0, 0, 0], chest: [0, 0.3, 0] }],
  [0.25, { arR: [-1.6, 0, -0.05], elR: [0, 0, 0], haR: [0.6, 0, 0], fiR: [0, 0, 0.2], chest: [0, -0.3, 0] }],
  [0.6, { arR: [-1.55, 0, -0.05], elR: [-0.1, 0, 0], haR: [0.5, 0, 0], fiR: [0, 0, 0.2], chest: [0, -0.3, 0] }],
  [1, {}],
] };
ACT.yank = { hit: 0.55, keys: [
  [0, { arR: [-1.6, 0, -0.05], elR: [0, 0, 0], arL: [-1.6, 0, 0.05], elL: [0, 0, 0], chest: [0, 0, 0] }],
  [0.3, { arR: [-1.6, 0, -0.05], elR: [0, 0, 0], arL: [-1.6, 0, 0.05], elL: [0, 0, 0], spine: [0.1, 0, 0] }],
  [0.55, { arR: [0.3, 0, -0.3], elR: [-1.8, 0, 0], arL: [0.3, 0, 0.3], elL: [-1.8, 0, 0], spine: [-0.3, 0, 0], chest: [-0.2, 0, 0], rootY: -0.1 }],
  [1, {}],
] };
ACT.bomb = { hit: 0.35, keys: [
  [0, { arR: [0.4, 0, -0.5], elR: [-1.8, 0, 0], chest: [0, 0.6, 0] }],
  [0.35, { arR: [-2.4, 0, -0.1], elR: [-0.1, 0, 0], chest: [-0.1, -0.5, 0], spine: [0.2, 0, 0] }],
  [1, {}],
] };
ACT.dodge = { keys: [
  [0, { rootY: -0.2, thL: [-0.8, 0, 0], knL: [1.3, 0, 0], thR: [-0.8, 0, 0], knR: [1.3, 0, 0] }],
  [0.25, { pivot: [-2.2, 0, 0], rootY: 0.55, thL: [-1.6, 0, 0], knL: [2.3, 0, 0], thR: [-1.6, 0, 0], knR: [2.3, 0, 0], spine: [0.6, 0, 0], arL: [-0.8, 0, 0.3], arR: [-0.8, 0, -0.3] }],
  [0.65, { pivot: [-5.4, 0, 0], rootY: 0.4, thL: [-1.4, 0, 0], knL: [2.0, 0, 0], thR: [-1.4, 0, 0], knR: [2.0, 0, 0], spine: [0.5, 0, 0] }],
  [1, { pivot: [-6.28, 0, 0], rootY: -0.1, thL: [-0.5, 0, 0], knL: [0.9, 0, 0], thR: [-0.5, 0, 0], knR: [0.9, 0, 0] }],
] };
ACT.roll = { keys: [
  [0, { rootY: -0.1 }],
  [0.5, { pivot: [0, 0, 3.14], rootY: 0.45, thL: [-1.4, 0, 0], knL: [2.1, 0, 0], thR: [-1.4, 0, 0], knR: [2.1, 0, 0], spine: [0.5, 0, 0], arL: [-1.0, 0, 0.6], arR: [-1.0, 0, -0.6] }],
  [1, { pivot: [0, 0, 6.28], rootY: -0.1, thL: [-0.5, 0, 0], knL: [0.9, 0, 0], thR: [-0.5, 0, 0], knR: [0.9, 0, 0] }],
] };
ACT.rollL = { keys: ACT.roll.keys.map(([t, o]) => [t, o.pivot ? { ...o, pivot: [0, 0, -o.pivot[2]] } : o]) };
ACT.flip = { keys: [
  [0, { thL: [-1.2, 0, 0], knL: [2.0, 0, 0], thR: [-1.2, 0, 0], knR: [2.0, 0, 0] }],
  [0.5, { pivot: [3.14, 0, 0], thL: [-1.7, 0, 0], knL: [2.4, 0, 0], thR: [-1.7, 0, 0], knR: [2.4, 0, 0], spine: [0.7, 0, 0], arL: [-1.3, 0, 0.2], arR: [-1.3, 0, -0.2] }],
  [1, { pivot: [6.28, 0, 0] }],
] };
// symbiote-suit attacks — wider, heavier, tendrils do the reaching
ACT.tendrilA = { hit: 0.4, keys: [
  [0, { chest: [0, 0.9, 0], arR: [-0.3, 0, -1.4], elR: [-0.3, 0, 0], arL: [-0.6, 0, 0.6], elL: [-1.6, 0, 0], spine: [0.15, 0, 0] }],
  [0.4, { chest: [0.1, -1.0, 0], arR: [-1.4, 0, -0.2], elR: [-0.1, 0, 0], arL: [0.2, 0, 1.3], spine: [0.3, 0, 0], thR: [-0.4, 0, -0.2], knR: [0.7, 0, 0] }],
  [1, {}],
] };
ACT.tendrilB = mirror(ACT.tendrilA);
ACT.tendrilC = { hit: 0.42, keys: [
  [0, { arL: [-3.0, 0, 0.5], arR: [-3.0, 0, -0.5], elL: [-0.8, 0, 0], elR: [-0.8, 0, 0], spine: [-0.35, 0, 0], rootY: 0.05 }],
  [0.42, { arL: [-0.8, 0, 0.15], arR: [-0.8, 0, -0.15], elL: [-0.1, 0, 0], elR: [-0.1, 0, 0], spine: [0.8, 0, 0], thL: [-1.1, 0, 0.3], knL: [1.5, 0, 0], thR: [-0.2, 0, -0.3], knR: [1.4, 0, 0], rootY: -0.35 }],
  [1, {}],
] };
ACT.surge = { hit: 0.45, keys: [
  [0, { rootY: -0.35, spine: [0.7, 0, 0], arL: [-0.4, 0, 0.3], arR: [-0.4, 0, -0.3], elL: [-2.2, 0, 0], elR: [-2.2, 0, 0], thL: [-1.2, 0, 0.4], knL: [1.9, 0, 0], thR: [-1.2, 0, -0.4], knR: [1.9, 0, 0] }],
  [0.45, { rootY: 0.05, spine: [-0.45, 0, 0], head: [-0.5, 0, 0], arL: [-0.3, 0, 1.6], arR: [-0.3, 0, -1.6], elL: [0, 0, 0], elR: [0, 0, 0], thL: [0, 0, 0.4], knL: [0.2, 0, 0], thR: [0, 0, -0.4], knR: [0.2, 0, 0] }],
  [0.75, { spine: [-0.4, 0, 0], arL: [-0.3, 0, 1.5], arR: [-0.3, 0, -1.5] }],
  [1, {}],
] };
// enemy moves
ACT.punch = { hit: 0.62, keys: [
  [0, {}],
  [0.5, { arR: [0.5, 0, -0.7], elR: [-1.7, 0, 0], chest: [0.05, 0.7, 0], spine: [-0.05, 0, 0] }],
  [0.62, { arR: [-1.55, 0, -0.1], elR: [-0.15, 0, 0], chest: [0.15, -0.6, 0], spine: [0.3, 0, 0], thR: [-0.6, 0, 0], knR: [0.7, 0, 0] }],
  [0.8, { arR: [-1.45, 0, -0.1], elR: [-0.2, 0, 0], chest: [0.15, -0.5, 0], spine: [0.25, 0, 0] }],
  [1, {}],
] };
ACT.pipe = { hit: 0.64, keys: [
  [0, {}],
  [0.52, { arR: [-2.9, 0, -0.4], elR: [-1.2, 0, 0], arL: [-2.6, 0, 0.3], elL: [-1.4, 0, 0], spine: [-0.3, 0, 0], chest: [0, 0.3, 0] }],
  [0.64, { arR: [-0.5, 0, -0.1], elR: [-0.1, 0, 0], arL: [-0.6, 0, 0.1], elL: [-0.4, 0, 0], spine: [0.6, 0, 0], chest: [0, -0.2, 0], thR: [-0.7, 0, 0], knR: [0.8, 0, 0] }],
  [1, {}],
] };
ACT.slash = { hit: 0.58, keys: [
  [0, {}],
  [0.48, { arR: [-1.0, 0, -1.6], elR: [-0.4, 0, 0], chest: [0, 0.8, 0], spine: [0.3, 0, 0] }],
  [0.58, { arR: [-1.4, 0, 0.6], elR: [-0.2, 0, 0], chest: [0, -0.9, 0], spine: [0.7, 0, 0] }],
  [1, {}],
] };
ACT.leap = { hit: 0.5, keys: [
  [0, { rootY: -0.3, spine: [0.9, 0, 0], thL: [-1.4, 0, 0], knL: [2.2, 0, 0], thR: [-1.4, 0, 0], knR: [2.2, 0, 0], arL: [0.6, 0, 0.4], arR: [0.6, 0, -0.4] }],
  [0.5, { pivot: [0.6, 0, 0], arL: [-2.4, 0, 0.6], arR: [-2.4, 0, -0.6], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], thL: [0.2, 0, 0], knL: [0.3, 0, 0], thR: [0.3, 0, 0], knR: [0.6, 0, 0], spine: [-0.1, 0, 0] }],
  [1, { pivot: [0.3, 0, 0], arL: [-1.4, 0, 0.6], arR: [-1.4, 0, -0.6] }],
] };
ACT.smash = { hit: 0.66, keys: [
  [0, {}],
  [0.55, { arL: [-3.1, 0, 0.25], arR: [-3.1, 0, -0.25], elL: [-0.9, 0, 0], elR: [-0.9, 0, 0], spine: [-0.45, 0, 0], head: [-0.3, 0, 0], rootY: 0.05 }],
  [0.66, { arL: [-0.9, 0, 0.1], arR: [-0.9, 0, -0.1], elL: [-0.1, 0, 0], elR: [-0.1, 0, 0], spine: [0.95, 0, 0], thL: [-1.0, 0, 0.3], knL: [1.4, 0, 0], thR: [-1.0, 0, -0.3], knR: [1.4, 0, 0], rootY: -0.35 }],
  [0.85, { arL: [-0.9, 0, 0.1], arR: [-0.9, 0, -0.1], spine: [0.9, 0, 0], rootY: -0.3 }],
  [1, {}],
] };
ACT.aim = { keys: [
  [0, { arR: [-1.5, 0.25, -0.12], elR: [-0.1, 0, 0], arL: [-1.3, 0, 0.55], elL: [-0.7, 0, 0], chest: [0, 0.2, 0], head: [0, 0.2, 0] }],
  [1, { arR: [-1.5, 0.25, -0.12], elR: [-0.1, 0, 0], arL: [-1.3, 0, 0.55], elL: [-0.7, 0, 0], chest: [0, 0.2, 0], head: [0, 0.2, 0] }],
] };
ACT.getup = { keys: [
  [0, { pivot: [-1.5, 0, 0], rootY: -0.88 }],
  [0.4, { pivot: [-0.6, 0, 0], rootY: -0.65, thL: [-1.6, 0, 0], knL: [2.2, 0, 0], thR: [-1.0, 0, 0], knR: [1.8, 0, 0], arL: [0.4, 0, 0.6], arR: [0.4, 0, -0.6] }],
  [0.75, { pivot: [0.1, 0, 0], rootY: -0.4, spine: [0.6, 0, 0], thL: [-1.5, 0, 0], knL: [2.0, 0, 0], thR: [-0.9, 0, 0], knR: [1.6, 0, 0] }],
  [1, {}],
] };
export { ACT };

const EASE = (t) => t * t * (3 - 2 * t);
// Evaluate an action at normalised time t on top of `base`, writing into `out`.
export function evalAction(out, base, act, t) {
  out.copy(base);
  const keys = act.keys;
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, k0] = keys[i], [t1, k1] = keys[Math.min(i + 1, keys.length - 1)];
  const u = t1 > t0 ? EASE(clamp((t - t0) / (t1 - t0), 0, 1)) : 1;
  const names = new Set([...Object.keys(k0), ...Object.keys(k1)]);
  for (const j of names) {
    if (j === 'rootY') {
      const a = k0.rootY ?? base.rootY, b = k1.rootY ?? base.rootY;
      out.rootY = lerp(a, b, u);
      continue;
    }
    const a = k0[j] ?? base.v[j], b = k1[j] ?? base.v[j];
    out.set(j, lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
function lathe(points, sx = 1, sz = 1, seg = 28, sculpt = null) {
  const pts = points.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y));
  const g = new THREE.LatheGeometry(pts, seg, -Math.PI / 2, Math.PI * 2);
  const pos = g.attributes.position;
  const ymin = points[0][1], ymax = points[points.length - 1][1];
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (sculpt) {
      const ang = Math.atan2(x, z); // 0 = front (+z)
      const v = (y - ymin) / (ymax - ymin);
      const r = Math.hypot(x, z);
      const d = sculpt(ang, v, r);
      if (r > 1e-5) { x += (x / r) * d; z += (z / r) * d; }
    }
    pos.setXYZ(i, x * sx, y, z * sz);
  }
  g.computeVertexNormals();
  // weld the normals along the lathe seam
  const nrm = g.attributes.normal, np = points.length;
  for (let j = 0; j < np; j++) {
    const a = j, b = seg * np + j;
    const nx = nrm.getX(a) + nrm.getX(b), ny = nrm.getY(a) + nrm.getY(b), nz = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / l, ny / l, nz / l); nrm.setXYZ(b, nx / l, ny / l, nz / l);
  }
  return g;
}
const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));

function buildGeometries(build) {
  const k = build.bulk; // radius multiplier
  const g = {};
  g.pelvis = lathe([[0.0, -0.13], [0.07, -0.128], [0.125 * k, -0.095], [0.148 * k, -0.035], [0.146 * k, 0.03], [0.138 * k, 0.085]], 1.12, 0.84, 28,
    (a, v) => 0.016 * gauss(Math.abs(a) - Math.PI, 0.7) * gauss(v - 0.45, 0.2));
  g.abdomen = lathe([[0.137 * k, -0.01], [0.13 * k, 0.06], [0.128 * k * build.waist, 0.12], [0.138 * k, 0.18], [0.152 * k, 0.235]], 1.16, 0.8, 28,
    build.abs ? (a, v) => {
      // six-pack
      if (Math.abs(a) > 0.75) return 0;
      const col = gauss(Math.abs(a) - 0.22, 0.12);
      const row = Math.abs(Math.sin(v * Math.PI * 3.0));
      return 0.006 * col * row - 0.004 * gauss(a, 0.05);
    } : null);
  g.chest = lathe([[0.15 * k, 0.0], [0.168 * k, 0.06], [0.184 * k, 0.13], [0.19 * k, 0.19], [0.18 * k, 0.245], [0.145 * k, 0.285], [0.075, 0.312], [0.0, 0.32]], 1.32 * build.shoulders, 0.74, 32,
    (a, v) => {
      let d = 0;
      // pecs
      d += build.pec * 0.022 * gauss(Math.abs(a) - 0.42, 0.3) * gauss(v - 0.55, 0.16);
      d -= 0.006 * gauss(a, 0.06) * gauss(v - 0.55, 0.25);
      // lats & shoulder blades
      d += 0.01 * gauss(Math.abs(a) - 2.0, 0.4) * gauss(v - 0.35, 0.2);
      d += 0.008 * gauss(Math.abs(a) - 2.7, 0.3) * gauss(v - 0.6, 0.15);
      return d;
    });
  g.neck = lathe([[0.058 * k, -0.03], [0.053 * k, 0.05], [0.05 * k, 0.11]], 1.05, 1, 16);
  const ka = k * (build.arm || 1);
  g.upperArm = lathe([[0.04 * ka, -0.29], [0.048 * ka, -0.25], [0.057 * ka, -0.18], [0.061 * ka, -0.11], [0.062 * ka, -0.05], [0.056 * ka, -0.005], [0.03, 0.03]], 1, 1, 18,
    (a, v) => 0.008 * build.pec * gauss(a, 0.6) * gauss(v - 0.55, 0.18));
  g.foreArm = lathe([[0.031 * ka, -0.27], [0.035 * ka, -0.22], [0.046 * ka, -0.13], [0.051 * ka, -0.06], [0.047 * ka, -0.01], [0.036, 0.02]], 1, 0.9, 18);
  g.thigh = lathe([[0.052 * k, -0.45], [0.058 * k, -0.4], [0.074 * k, -0.3], [0.085 * k, -0.19], [0.09 * k, -0.09], [0.087 * k, -0.01], [0.06, 0.04]], 1, 1, 20,
    (a, v) => 0.008 * gauss(a, 0.5) * gauss(v - 0.55, 0.2) + 0.005 * gauss(Math.abs(a) - 1.2, 0.4) * gauss(v - 0.7, 0.2));
  g.shin = lathe([[0.034 * k, -0.44], [0.037 * k, -0.38], [0.048 * k, -0.28], [0.057 * k, -0.18], [0.05 * k, -0.06], [0.052 * k, -0.005], [0.04, 0.03]], 1, 1, 18,
    (a, v) => 0.01 * gauss(Math.abs(a) - Math.PI, 0.6) * gauss(v - 0.72, 0.13));
  g.joint = new THREE.SphereGeometry(1, 16, 12);
  g.head = new THREE.SphereGeometry(0.115, 40, 30);
  {
    const pos = g.head.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ny = y / 0.115;
      if (ny < 0.1) x *= 1 - (0.1 - ny) * build.jaw; // jaw taper
      if (z > 0 && ny < 0.25 && ny > -0.6) z *= 1 + 0.06 * gauss(ny + 0.1, 0.25) * gauss(x / 0.115, 0.25); // nose/mouth
      if (z < 0) z *= 1.05; // back of skull
      pos.setXYZ(i, x * 0.9, y * 1.08, z);
    }
    g.head.computeVertexNormals();
  }
  g.palm = new THREE.SphereGeometry(1, 14, 10);
  g.foot = new THREE.SphereGeometry(1, 16, 10);
  {
    const pos = g.foot.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.3) pos.setY(i, -0.3 - (pos.getY(i) + 0.3) * 0.25); // flat sole
    g.foot.computeVertexNormals();
  }
  return g;
}

function eyeShape(s = 1) {
  const sh = new THREE.Shape();
  sh.moveTo(-0.024 * s, -0.004 * s);
  sh.quadraticCurveTo(-0.012 * s, 0.024 * s, 0.027 * s, 0.021 * s);
  sh.quadraticCurveTo(0.036 * s, 0.006 * s, 0.021 * s, -0.013 * s);
  sh.quadraticCurveTo(0.0, -0.018 * s, -0.024 * s, -0.004 * s);
  return sh;
}

// ---------------------------------------------------------------------------
// Canvas-painted textures. UV convention: u around (front at 0.25, left 0.5, back 0.75), v bottom→top.
// ---------------------------------------------------------------------------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function noiseFill(ctx, w, h, base, amt, rnd, cell = 2) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
    const v = (rnd() - 0.5) * amt;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(x, y, cell, cell);
  }
}
function webLines(ctx, w, h, { nU = 16, nV = 6, color = '#140304', width = 2, sag = 0.3, v0 = 0, v1 = 1, uShift = 0 }) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  const yv = (v) => (1 - v) * h;
  for (let i = 0; i <= nU; i++) {
    const x = ((i / nU + uShift) % 1) * w;
    ctx.beginPath(); ctx.moveTo(x, yv(v0)); ctx.lineTo(x, yv(v1)); ctx.stroke();
  }
  const cw = w / nU, ch = (yv(v0) - yv(v1)) / nV;
  for (let j = 0; j <= nV; j++) {
    const y = yv(v1) + j * ch;
    ctx.beginPath();
    for (let i = 0; i < nU; i++) {
      const x0 = ((i / nU + uShift) % 1) * w;
      ctx.moveTo(x0, y);
      ctx.quadraticCurveTo(x0 + cw / 2, y + ch * sag, x0 + cw, y);
    }
    ctx.stroke();
  }
}
function spider(ctx, cx, cy, s, color, legs = 1) {
  ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(0, -s * 0.18, s * 0.11, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, s * 0.2, s * 0.13, s * 0.26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -s * 0.38, s * 0.07, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = s * 0.06;
  for (const sd of [-1, 1]) {
    const L = [
      [[0.08, -0.25], [0.45 * legs, -0.55], [0.6 * legs, -0.95]],
      [[0.1, -0.18], [0.55 * legs, -0.3], [0.85 * legs, -0.6]],
      [[0.1, -0.08], [0.55 * legs, 0.1], [0.85 * legs, 0.45]],
      [[0.08, 0.0], [0.45 * legs, 0.4], [0.6 * legs, 0.95]],
    ];
    for (const [a, b, c] of L) {
      ctx.beginPath(); ctx.moveTo(a[0] * s * sd, a[1] * s);
      ctx.quadraticCurveTo(b[0] * s * sd, b[1] * s, c[0] * s * sd, c[1] * s);
      ctx.stroke();
    }
  }
  ctx.restore();
}

const SUIT = { red: '#b3121b', redD: '#7a0a10', blue: '#1b2d6b', blueD: '#101b45', line: '#1a0306', black: '#09090c' };

function paintHero(part, mode) {
  // mode: 'red' | 'relief' | 'black'
  const R = mode === 'relief';
  const dims = { chest: [1024, 256], abdomen: [1024, 256], pelvis: [1024, 256], upperArm: [512, 512], foreArm: [512, 512], hand: [256, 128],
    thigh: [512, 512], shin: [512, 512], foot: [256, 128], head: [1024, 512], neck: [512, 128], joint: [256, 128] };
  let [w, h] = dims[part];
  if (mode === 'black') { w = Math.max(128, w / 2); h = Math.max(64, h / 2); }
  const [c, ctx] = canvas(w, h);
  const rnd = rng(part.length * 97 + (mode === 'black' ? 7 : 0));
  const red = R ? '#ffffff' : SUIT.red, blue = R ? '#f0f0f0' : SUIT.blue, line = R ? '#7a7a7a' : SUIT.line;
  const lw = R ? 3.2 : 2.4;
  if (mode === 'black') {
    noiseFill(ctx, w, h, SUIT.black, 0.05, rnd, 2);
    const white = '#e9e9ee';
    if (part === 'chest') { spider(ctx, w * 0.25, h * 0.48, h * 0.62, white, 1.9); spider(ctx, w * 0.75, h * 0.5, h * 0.62, white, 1.9); }
    if (part === 'hand') { ctx.fillStyle = white; ctx.beginPath(); ctx.ellipse(w * 0.75, h * 0.5, w * 0.12, h * 0.25, 0, 0, Math.PI * 2); ctx.fill(); }
    return tex(c);
  }
  const fill = (col) => { if (R) { ctx.fillStyle = col; ctx.fillRect(0, 0, w, h); } else noiseFill(ctx, w, h, col, 0.06, rnd, 2); };
  const blueRegion = (path) => { ctx.save(); path(); ctx.clip(); fill(blue); ctx.restore(); ctx.strokeStyle = R ? '#9a9a9a' : '#050505'; ctx.lineWidth = lw * 1.4; path(); ctx.stroke(); };
  const sidePatch = (cx, topY, halfW) => () => {
    ctx.beginPath();
    ctx.moveTo(cx * w - halfW * w, h + 2);
    ctx.quadraticCurveTo(cx * w - halfW * w * 0.6, topY * h + (h - topY * h) * 0.25, cx * w, topY * h);
    ctx.quadraticCurveTo(cx * w + halfW * w * 0.6, topY * h + (h - topY * h) * 0.25, cx * w + halfW * w, h + 2);
    ctx.closePath();
  };
  switch (part) {
    case 'chest': {
      fill(red);
      webLines(ctx, w, h, { nU: 26, nV: 4, color: line, width: lw, sag: 0.35 });
      for (const cx of [0.5, 0.0, 1.0]) blueRegion(sidePatch(cx, 0.32, 0.13));
      if (!R) {
        spider(ctx, w * 0.25, h * 0.46, h * 0.42, '#0a0a0a', 1.0);
        spider(ctx, w * 0.75, h * 0.52, h * 0.7, SUIT.redD, 1.3);
      } else {
        spider(ctx, w * 0.25, h * 0.46, h * 0.42, '#b0b0b0', 1.0);
      }
      break;
    }
    case 'abdomen': {
      fill(blue);
      ctx.save();
      ctx.beginPath();
      // front red V narrowing toward the belt, plus back panel
      for (const cx of [0.25, 0.75]) {
        ctx.moveTo((cx - 0.13) * w, 0); ctx.lineTo((cx + 0.13) * w, 0);
        ctx.quadraticCurveTo((cx + 0.1) * w, h * 0.6, (cx + 0.07) * w, h); ctx.lineTo((cx - 0.07) * w, h);
        ctx.quadraticCurveTo((cx - 0.1) * w, h * 0.6, (cx - 0.13) * w, 0); ctx.closePath();
      }
      ctx.clip(); fill(red); webLines(ctx, w, h, { nU: 26, nV: 3, color: line, width: lw, sag: 0.35 }); ctx.restore();
      ctx.strokeStyle = R ? '#9a9a9a' : '#050505'; ctx.lineWidth = lw * 1.4;
      for (const cx of [0.25, 0.75]) {
        ctx.beginPath(); ctx.moveTo((cx - 0.13) * w, 0); ctx.quadraticCurveTo((cx - 0.1) * w, h * 0.6, (cx - 0.07) * w, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo((cx + 0.13) * w, 0); ctx.quadraticCurveTo((cx + 0.1) * w, h * 0.6, (cx + 0.07) * w, h); ctx.stroke();
      }
      break;
    }
    case 'pelvis': {
      fill(blue);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h * 0.16); ctx.clip(); fill(red); webLines(ctx, w, h, { nU: 26, nV: 1, color: line, width: lw, v0: 0.84, v1: 1 }); ctx.restore();
      ctx.strokeStyle = R ? '#9a9a9a' : '#050505'; ctx.lineWidth = lw * 1.5; ctx.beginPath(); ctx.moveTo(0, h * 0.16); ctx.lineTo(w, h * 0.16); ctx.stroke();
      break;
    }
    case 'upperArm': {
      fill(red); webLines(ctx, w, h, { nU: 10, nV: 4, color: line, width: lw, sag: 0.3 });
      blueRegion(() => { ctx.beginPath(); ctx.moveTo(0.6 * w, h + 2); ctx.quadraticCurveTo(0.66 * w, h * 0.45, 0.75 * w, h * 0.12); ctx.quadraticCurveTo(0.84 * w, h * 0.45, 0.9 * w, h + 2); ctx.closePath(); });
      break;
    }
    case 'foreArm': case 'hand': case 'foot': case 'neck': case 'joint': {
      fill(red); webLines(ctx, w, h, { nU: part === 'hand' || part === 'foot' ? 8 : 10, nV: part === 'foreArm' ? 4 : 2, color: line, width: lw * (w < 300 ? 0.6 : 1), sag: 0.3 });
      break;
    }
    case 'thigh': fill(blue); break;
    case 'shin': {
      fill(blue);
      ctx.save(); ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.5 + Math.sin((x / w) * Math.PI * 4 - Math.PI / 2) * h * 0.06);
      ctx.lineTo(w, h); ctx.closePath(); ctx.clip();
      fill(red); webLines(ctx, w, h, { nU: 10, nV: 3, color: line, width: lw, v0: 0, v1: 0.56, sag: 0.3 }); ctx.restore();
      ctx.strokeStyle = R ? '#9a9a9a' : '#050505'; ctx.lineWidth = lw * 1.4; ctx.beginPath();
      for (let x = 0; x <= w; x += 8) { const y = h * 0.5 + Math.sin((x / w) * Math.PI * 4 - Math.PI / 2) * h * 0.06; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
      break;
    }
    case 'head': {
      fill(red);
      // web radiating from between the eyes
      ctx.strokeStyle = line; ctx.lineWidth = lw;
      const cx = 0.25 * w, cy = 0.55 * h;
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * w * 0.9, cy + Math.sin(a) * h * 1.2);
        ctx.stroke();
      }
      for (let r = 1; r < 9; r++) {
        ctx.beginPath();
        for (let i = 0; i <= 28; i++) {
          const a = (i / 28) * Math.PI * 2, rr = r * 0.055;
          const x = cx + Math.cos(a) * w * rr * 0.95, y = cy + Math.sin(a) * h * rr * 1.25;
          const am = ((i - 0.5) / 28) * Math.PI * 2;
          const mx = cx + Math.cos(am) * w * rr * 0.9, my = cy + Math.sin(am) * h * rr * 1.18;
          if (i === 0) ctx.moveTo(x, y); else ctx.quadraticCurveTo(mx, my, x, y);
        }
        ctx.stroke();
      }
      // meridians wrap round the back
      webLines(ctx, w, h, { nU: 14, nV: 0, color: line, width: lw, v0: 0.05, v1: 0.95, uShift: 0.6 / 14 });
      break;
    }
  }
  return tex(c, !R);
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
export const HERO_U = { uMix: { value: 0 }, uChest: { value: new THREE.Vector3() }, uTime: { value: 0 } };

function heroMaterial(part) {
  const map = paintHero(part, 'red');
  const relief = paintHero(part, 'relief');
  const mapB = paintHero(part, 'black');
  const m = new THREE.MeshPhysicalMaterial({
    map, roughnessMap: relief, bumpMap: relief, bumpScale: -1.4, roughness: 0.78, metalness: 0,
    sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color(0.7, 0.3, 0.3), clearcoat: 1, clearcoatRoughness: 0.1,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.mapB = { value: mapB };
    Object.assign(s.uniforms, HERO_U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSW; uniform sampler2D mapB; uniform float uMix; uniform vec3 uChest; uniform float uTime;\n${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `
        vec4 tA = texture2D(map, vMapUv);
        vec4 tB = texture2D(mapB, vMapUv);
        float dd = distance(vSW, uChest) + (vnoise(vSW * 16.0 + uTime * 0.7) - 0.5) * 0.22;
        float R = uMix * 1.7;
        float suitK = 1.0 - smoothstep(R - 0.03, R + 0.03, dd);
        if (uMix > 0.999) suitK = 1.0;
        if (uMix < 0.001) suitK = 0.0;
        float sEdge = (1.0 - smoothstep(0.0, 0.06, abs(dd - R))) * step(0.001, uMix) * step(uMix, 0.999);
        diffuseColor *= mix(tA, tB, suitK);`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          roughnessFactor *= texture2D(roughnessMap, vRoughnessMapUv).g;
        #endif
        roughnessFactor = mix(roughnessFactor, 0.2, suitK);`)
      .replace('dHdxy_fwd(), faceDirection', 'dHdxy_fwd() * (1.0 - suitK), faceDirection')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += sEdge * vec3(0.75, 0.7, 1.0) * 4.0;`)
      .replace('material.clearcoat = clearcoat;', 'material.clearcoat = clearcoat * suitK;')
      .replace('material.sheenColor = sheenColor;', 'material.sheenColor = mix(sheenColor, vec3(0.1, 0.12, 0.3), suitK);');
  };
  return m;
}

function paintEnemy(part, look, rnd) {
  const dims = { chest: [512, 128], abdomen: [512, 128], pelvis: [512, 128], upperArm: [256, 256], foreArm: [256, 256], hand: [128, 64],
    thigh: [256, 256], shin: [256, 256], foot: [128, 64], head: [512, 256], neck: [256, 64], joint: [128, 64] };
  const [w, h] = dims[part];
  const [c, ctx] = canvas(w, h);
  if (look.symbiote) {
    noiseFill(ctx, w, h, '#060508', 0.06, rnd, 2);
    if (part === 'head') {
      // jagged white eyes and a fanged maw
      ctx.fillStyle = '#f2f2f2';
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        const cx = w * 0.25 + sd * w * 0.045, cy = h * 0.42;
        ctx.moveTo(cx - sd * w * 0.01, cy + h * 0.04);
        ctx.lineTo(cx + sd * w * 0.07, cy - h * 0.14);
        ctx.lineTo(cx + sd * w * 0.05, cy + h * 0.02);
        ctx.lineTo(cx + sd * w * 0.025, cy + h * 0.1);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#3a0508';
      ctx.beginPath(); ctx.ellipse(w * 0.25, h * 0.66, w * 0.07, h * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4f0e6';
      for (let i = -5; i <= 5; i++) {
        const x = w * 0.25 + i * w * 0.012;
        ctx.beginPath(); ctx.moveTo(x - 4, h * 0.6); ctx.lineTo(x + 4, h * 0.6); ctx.lineTo(x, h * 0.66); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 4, h * 0.73); ctx.lineTo(x + 4, h * 0.73); ctx.lineTo(x, h * 0.67); ctx.fill();
      }
    }
    return tex(c);
  }
  const { jacket, pants, skin, shoe, hat, hair } = look;
  switch (part) {
    case 'chest': case 'abdomen': case 'upperArm': {
      noiseFill(ctx, w, h, jacket, 0.09, rnd, 2);
      if (part !== 'upperArm') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(w * 0.25 - 2, 0, 4, h);
        if (look.stripe) { ctx.fillStyle = look.stripe; ctx.fillRect(0, h * 0.35, w, h * 0.1); }
      } else if (look.stripe) { ctx.fillStyle = look.stripe; ctx.fillRect(w * 0.45, 0, w * 0.1, h); }
      if (part === 'chest' && look.logo) { ctx.fillStyle = look.logo; ctx.font = `bold ${h * 0.3}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(look.logoText, w * 0.25, h * 0.55); }
      break;
    }
    case 'foreArm': {
      noiseFill(ctx, w, h, jacket, 0.09, rnd, 2);
      if (look.rolled) { ctx.fillStyle = skin; ctx.fillRect(0, h * 0.45, w, h); }
      break;
    }
    case 'pelvis': case 'thigh': {
      noiseFill(ctx, w, h, pants, 0.14, rnd, 1);
      if (part === 'pelvis') { ctx.fillStyle = '#151210'; ctx.fillRect(0, 0, w, h * 0.14); }
      break;
    }
    case 'shin': { noiseFill(ctx, w, h, pants, 0.14, rnd, 1); ctx.fillStyle = shoe; ctx.fillRect(0, h * 0.9, w, h * 0.1); break; }
    case 'foot': noiseFill(ctx, w, h, shoe, 0.05, rnd, 2); ctx.fillStyle = '#ddd'; ctx.fillRect(0, h * 0.62, w, h * 0.12); break;
    case 'hand': case 'neck': case 'joint': noiseFill(ctx, w, h, part === 'joint' ? jacket : skin, 0.04, rnd, 2); break;
    case 'head': {
      noiseFill(ctx, w, h, skin, 0.05, rnd, 2);
      // face (front at u = 0.25)
      const fx = w * 0.25;
      ctx.fillStyle = hair; ctx.fillRect(0, 0, w, h * 0.3);
      ctx.fillRect(fx + w * 0.12, 0, w * 0.26, h * 0.62);
      if (hat) { ctx.fillStyle = hat; ctx.fillRect(0, 0, w, h * 0.36); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, h * 0.32, w, h * 0.04); }
      ctx.fillStyle = '#1a1210';
      ctx.fillRect(fx - w * 0.05, h * 0.4, w * 0.035, h * 0.02); ctx.fillRect(fx + w * 0.015, h * 0.4, w * 0.035, h * 0.02);
      ctx.fillStyle = '#f0ece4';
      ctx.beginPath(); ctx.ellipse(fx - w * 0.032, h * 0.46, w * 0.016, h * 0.022, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(fx + w * 0.032, h * 0.46, w * 0.016, h * 0.022, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#20140e';
      ctx.beginPath(); ctx.arc(fx - w * 0.032, h * 0.46, h * 0.014, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(fx + w * 0.032, h * 0.46, h * 0.014, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(80,30,25,0.8)'; ctx.fillRect(fx - w * 0.025, h * 0.64, w * 0.05, h * 0.018);
      if (look.mask) { ctx.fillStyle = look.mask; ctx.fillRect(fx - w * 0.09, h * 0.52, w * 0.18, h * 0.2); }
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(fx - w * 0.06, h * 0.6, w * 0.12, h * 0.12);
      break;
    }
  }
  return tex(c);
}

export const SYM_U = { uTime: { value: 0 } };
function enemyMaterial(part, look, rnd) {
  const map = paintEnemy(part, look, rnd);
  if (!look.symbiote) return new THREE.MeshStandardMaterial({ map, roughness: part === 'head' || part === 'hand' || part === 'neck' ? 0.55 : 0.85 });
  const m = new THREE.MeshPhysicalMaterial({ map, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 1, sheenColor: new THREE.Color(0.25, 0.05, 0.35), emissive: 0x000000 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, SYM_U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; varying vec3 vOP;\n${GLSL_NOISE}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOP = position;
        transformed += normal * (vnoise(position * 30.0 + vec3(0.0, uTime * 2.0, 0.0)) - 0.5) * 0.012;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; varying vec3 vOP;\n${GLSL_NOISE}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float vn = fbm3(vOP * 9.0 + vec3(0.0, uTime * 0.25, 0.0));
        float vw = fwidth(vn);
        totalEmissiveRadiance += (1.0 - smoothstep(0.0, 0.012 + vw, abs(vn - 0.5))) * (1.0 - smoothstep(0.02, 0.08, vw)) * vec3(0.9, 0.04, 0.2) * (0.35 + 0.3 * sin(uTime * 4.0 + vOP.y * 20.0));`);
  };
  return m;
}

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------
const BUILDS = {
  hero: { bulk: 1.0, arm: 1.16, waist: 0.95, shoulders: 1.02, pec: 1.0, abs: true, jaw: 0.6, scale: 1.0 },
  thug: { bulk: 1.12, arm: 1.1, waist: 1.12, shoulders: 1.0, pec: 0.5, abs: false, jaw: 0.3, scale: 1.0 },
  symbiote: { bulk: 0.92, arm: 1.0, waist: 0.8, shoulders: 1.08, pec: 1.2, abs: true, jaw: 0.9, scale: 1.08 },
  brute: { bulk: 1.45, arm: 1.2, waist: 1.05, shoulders: 1.3, pec: 1.6, abs: true, jaw: 0.5, scale: 1.55 },
};
const geoCache = {};

export class Character {
  constructor(kind, look = {}) {
    this.kind = kind;
    const build = BUILDS[kind === 'gunner' ? 'thug' : kind];
    const key = kind === 'gunner' ? 'thug' : kind;
    const G = geoCache[key] || (geoCache[key] = buildGeometries(build));
    const rnd = rng((look.seed || 1) * 7919);
    const mats = {};
    const parts = ['chest', 'abdomen', 'pelvis', 'upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot', 'head', 'neck', 'joint'];
    const isHero = kind === 'hero';
    for (const p of parts) mats[p] = isHero ? heroMaterial(p) : enemyMaterial(p, look, rnd);
    this.mats = Object.values(mats);

    const root = (this.root = new THREE.Group());
    const J = (this.j = {});
    const node = (name, parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); J[name] = o; return o; };
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz);
      m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    const k = build.bulk;
    const pivot = node('pivot', root, 0, 1.05, 0);
    const hips = node('hips', pivot, 0, -0.02, 0);
    mesh(G.pelvis, mats.pelvis, hips);
    const spine = node('spine', hips, 0, 0.09, 0);
    mesh(G.abdomen, mats.abdomen, spine);
    const chest = node('chest', spine, 0, 0.215, 0);
    mesh(G.chest, mats.chest, chest);
    const neck = node('neck', chest, 0, 0.27, -0.01);
    mesh(G.neck, mats.neck, neck);
    const head = node('head', neck, 0, 0.085, 0.0);
    this.headMesh = mesh(G.head, mats.head, head, 0, 0.085, 0.012, k * 0.97, k * 0.97, k * 0.97);
    // trapezius bridging neck and shoulders
    mesh(G.joint, mats.chest, chest, 0, 0.255, -0.02, 0.15 * build.shoulders * k, 0.055, 0.085 * k);
    for (const sd of ['L', 'R']) {
      const s = sd === 'L' ? 1 : -1;
      const ar = node('ar' + sd, chest, s * 0.2 * build.shoulders * k, 0.235, -0.01);
      mesh(G.upperArm, mats.upperArm, ar);
      mesh(G.joint, mats.upperArm, ar, s * 0.008, -0.025, 0, 0.07 * k * (build.arm || 1), 0.076 * k, 0.072 * k * (build.arm || 1)); // deltoid
      const el = node('el' + sd, ar, 0, -0.29, 0);
      mesh(G.foreArm, mats.foreArm, el);
      mesh(G.joint, mats.foreArm, el, 0, 0, 0, 0.044 * k, 0.044 * k, 0.044 * k);
      const ha = node('ha' + sd, el, 0, -0.27, 0);
      const kh = k * (build.arm || 1);
      mesh(G.palm, mats.hand, ha, 0, -0.052, 0.004, 0.025 * kh, 0.054, 0.047 * kh);
      const fi = node('fi' + sd, ha, 0, -0.092, 0.0);
      mesh(G.palm, mats.hand, fi, s * -0.004, -0.038, 0.002, 0.023 * kh, 0.046, 0.044 * kh);
      mesh(G.palm, mats.hand, ha, s * -0.012, -0.048, 0.043, 0.016, 0.036, 0.016).rotation.x = -0.4; // thumb
      const th = node('th' + sd, hips, s * 0.095 * k, -0.07, 0);
      mesh(G.thigh, mats.thigh, th);
      const kn = node('kn' + sd, th, 0, -0.45, 0);
      mesh(G.shin, mats.shin, kn);
      mesh(G.joint, mats.thigh, kn, 0, 0.0, 0.004, 0.052 * k, 0.055 * k, 0.055 * k);
      const ft = node('ft' + sd, kn, 0, -0.44, 0);
      mesh(G.foot, mats.foot, ft, 0, -0.03, 0.055, 0.047 * k, 0.045, 0.125);
    }
    if (isHero) {
      // the lenses
      const lens = new THREE.ExtrudeGeometry(eyeShape(1), { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0015, bevelSegments: 2 });
      const frame = new THREE.ExtrudeGeometry(eyeShape(1.28), { depth: 0.004, bevelEnabled: false });
      this.lensMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f6ff, emissive: 0xc8d4ff, emissiveIntensity: 0.35, roughness: 0.15, clearcoat: 1, metalness: 0.1 });
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.4 });
      for (const s of [1, -1]) {
        const g = new THREE.Group();
        g.position.set(s * 0.036, 0.1, 0.1135);
        g.rotation.set(-0.18, s * 0.42, s * -0.1);
        g.scale.set(s * 1.18, 1.18, 1.18);
        const f = new THREE.Mesh(frame, frameMat); f.position.set(-0.002, -0.0015, -0.003);
        const l = new THREE.Mesh(lens, this.lensMat);
        g.add(f, l);
        head.add(g);
      }
    }
    root.scale.setScalar(build.scale);
    this.scale = build.scale;

    this.pose = new Pose();
    this.tmpPose = new Pose();
    this.base = new Pose();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.overrides = {};
    this.rootY = 0;
  }

  // Smoothly drive joints toward `target` pose.
  drive(target, k, dt) {
    const a = damp(k, dt);
    for (const name of JOINTS) {
      const o = this.j[name];
      if (!o) continue;
      const v = target.v[name];
      this.e.set(v[0], v[1], v[2], name === 'pivot' ? 'YXZ' : 'XYZ');
      this.q.setFromEuler(this.e);
      if (name === 'pivot') {
        // pivot spins can exceed 2π, so drive it in Euler space to keep the flip direction
        const r = o.userData.e || (o.userData.e = [0, 0, 0]);
        r[0] += (v[0] - r[0]) * a; r[1] += (v[1] - r[1]) * a; r[2] += (v[2] - r[2]) * a;
        o.rotation.set(r[0], r[1], r[2], 'YXZ');
        continue;
      }
      o.quaternion.slerp(this.q, a);
    }
    this.rootY += (target.rootY - this.rootY) * a;
    this.j.pivot.position.y = 1.05 + this.rootY;
  }

  snapPivot(x = 0, y = 0, z = 0) {
    const o = this.j.pivot;
    o.userData.e = [x, y, z];
    o.rotation.set(x, y, z, 'YXZ');
  }

  // Point a limb at a world-space target (used for web-slinging arms).
  aimArm(side, target, weight = 1) {
    const ar = this.j['ar' + side];
    ar.parent.updateWorldMatrix(true, false);
    const sp = ar.getWorldPosition(_v1);
    const dirW = _v2.copy(target).sub(sp).normalize();
    const pq = ar.parent.getWorldQuaternion(_q1).invert();
    dirW.applyQuaternion(pq);
    _q2.setFromUnitVectors(_down, dirW);
    ar.quaternion.slerp(_q2, weight);
    const el = this.j['el' + side];
    el.quaternion.slerp(_qi, weight);
  }

  handWorld(side, out) {
    return this.j['fi' + side].getWorldPosition(out);
  }

  setFlash(v) {
    for (const m of this.mats) if (m.emissive) m.emissive.setRGB(v, v * 0.9, v * 0.8);
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.mats) { m.map?.dispose(); m.dispose(); }
  }
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _down = new THREE.Vector3(0, -1, 0);
void smooth;
