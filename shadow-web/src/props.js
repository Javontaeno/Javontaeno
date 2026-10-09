import * as THREE from 'three';
import { L } from './city.js';
import { dampAngle } from './util.js';

const _v = new THREE.Vector3();
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
function textTex(lines, w = 512, h = 128, bg = '#f4f4f4', fg = '#c41a1a') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.fillRect(0, h * 0.62, w, h * 0.16);
  g.font = `bold ${h * 0.36}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(lines, w / 2, h * 0.34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A vehicle that drives a list of waypoints.
class Vehicle {
  constructor(game) { this.game = game; this.group = new THREE.Group(); game.scene.add(this.group); this.path = []; this.i = 0; this.speed = 0; this.maxSpeed = 14; this.done = false; this.yaw = 0; this.pos = this.group.position; this.paused = false; }
  drive(path, speed = 14) { this.path = path.map((p) => p.clone()); this.i = 0; this.maxSpeed = speed; this.done = false; this.pos.copy(this.path[0]); }
  update(dt) {
    if (this.done || !this.path.length) { this.speed = 0; return; }
    const want = this.paused ? 0 : this.maxSpeed;
    this.speed += Math.max(-12 * dt, Math.min(5 * dt, want - this.speed));
    const tgt = this.path[Math.min(this.i + 1, this.path.length - 1)];
    const to = _v.copy(tgt).sub(this.pos); to.y = 0;
    const d = to.length();
    if (d < 1.5) { this.i++; if (this.i >= this.path.length - 1) { this.done = true; return; } }
    else {
      to.divideScalar(d);
      this.pos.addScaledVector(to, Math.min(d, this.speed * dt));
      this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 4, dt);
      this.group.rotation.y = this.yaw;
    }
  }
  remove() { this.group.removeFromParent(); }
}

export class Ambulance extends Vehicle {
  constructor(game) {
    super(game);
    const g = this.group;
    const side = std(0xffffff, { map: textTex('AMBULANCE') });
    const white = std(0xf2f2f2, { roughness: 0.35, metalness: 0.2 });
    box(2.3, 2.4, 4.4, [side, side, white, white, white, white], 0, 1.75, -0.9, g);
    box(2.2, 1.5, 1.8, white, 0, 1.25, 2.2, g);
    box(2.0, 0.7, 0.1, std(0x0b0e12, { roughness: 0.1, metalness: 0.8 }), 0, 1.65, 3.12, g);
    for (const [x, z] of [[-1, 2.1], [1, 2.1], [-1, -2.2], [1, -2.2]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 14), std(0x111111));
      w.rotation.z = Math.PI / 2; w.position.set(x * 1.05, 0.45, z); g.add(w);
    }
    this.red = glow(6, 0.3, 0.2); this.blue = glow(0.3, 0.8, 6);
    this.l1 = box(0.6, 0.2, 0.3, this.red, -0.55, 3.05, 1.25, g);
    this.l2 = box(0.6, 0.2, 0.3, this.blue, 0.55, 3.05, 1.25, g);
    box(0.4, 0.15, 0.05, glow(5, 5, 4.5), -0.7, 0.9, 3.12, g); box(0.4, 0.15, 0.05, glow(5, 5, 4.5), 0.7, 0.9, 3.12, g);
    this.t = 0;
  }
  update(dt) {
    super.update(dt);
    this.t += dt;
    const on = Math.sin(this.t * 14) > 0;
    this.l1.material = on ? this.red : this.blue; this.l2.material = on ? this.blue : this.red;
  }
}

export class GangCar extends Vehicle {
  constructor(game, color = 0x222222) {
    super(game);
    const g = this.group;
    const paint = std(color, { roughness: 0.25, metalness: 0.6 });
    box(1.9, 0.7, 4.6, paint, 0, 0.7, 0, g);
    box(1.7, 0.55, 2.3, std(0x0b0e12, { roughness: 0.1, metalness: 0.8 }), 0, 1.3, -0.2, g);
    box(0.4, 0.14, 0.05, glow(5, 5, 4.5), -0.62, 0.8, 2.31, g); box(0.4, 0.14, 0.05, glow(5, 5, 4.5), 0.62, 0.8, 2.31, g);
    box(0.4, 0.12, 0.05, glow(5, 0.2, 0.1), -0.66, 0.85, -2.31, g); box(0.4, 0.12, 0.05, glow(5, 0.2, 0.1), 0.66, 0.85, -2.31, g);
    for (const [x, z] of [[-1, 1.5], [1, 1.5], [-1, -1.5], [1, -1.5]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), std(0x0a0a0a));
      w.rotation.z = Math.PI / 2; w.position.set(x * 0.9, 0.36, z); g.add(w);
    }
  }
}

export class Helicopter {
  constructor(game, label = 'CHANNEL 7') {
    this.game = game;
    const g = (this.group = new THREE.Group());
    const body = std(0x1a2a6a, { roughness: 0.3, metalness: 0.5, map: textTex(label, 512, 128, '#1a2a6a', '#f2c21b') });
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1.4, 18, 14), body);
    cab.scale.set(1, 0.9, 1.6); g.add(cab);
    box(0.4, 0.4, 5, body, 0, 0.3, -3.6, g);
    box(0.1, 1.2, 0.8, body, 0, 0.8, -6, g);
    box(1.2, 0.1, 1.2, std(0x0b0e12, { roughness: 0.1, metalness: 0.9 }), 0, 0.2, 1.6, g);
    for (const x of [-0.9, 0.9]) box(0.12, 0.12, 3, std(0x111111), x, -1.4, 0, g);
    this.rotor = new THREE.Group(); this.rotor.position.y = 1.5; g.add(this.rotor);
    box(11, 0.06, 0.35, std(0x111111), 0, 0, 0, this.rotor); box(0.35, 0.06, 11, std(0x111111), 0, 0, 0, this.rotor);
    this.tail = box(0.05, 1.6, 0.2, std(0x111111), 0.25, 0.8, -6, g);
    // searchlight cone
    const cone = new THREE.Mesh(new THREE.ConeGeometry(6, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.9, 0.8), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.geometry.translate(0, -20, 0);
    this.beam = new THREE.Group(); this.beam.add(cone); this.beam.position.set(0, -1.2, 1.2); g.add(this.beam);
    // fake light pool instead of a real SpotLight (adding lights forces every material to recompile)
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.15, 1), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    game.scene.add(g, this.pool);
    this.center = new THREE.Vector3(); this.radius = 30; this.height = 25; this.ang = 0; this.target = null;
    this.pos = g.position;
  }
  update(dt) {
    this.rotor.rotation.y += dt * 30; this.tail.rotation.x += dt * 40;
    this.ang += dt * 0.25;
    const want = _v.set(this.center.x + Math.cos(this.ang) * this.radius, this.center.y + this.height, this.center.z + Math.sin(this.ang) * this.radius);
    this.group.position.lerp(want, 1 - Math.exp(-dt * 1.2));
    const look = this.target || this.center;
    this.group.rotation.y = Math.atan2(look.x - this.group.position.x, look.z - this.group.position.z);
    this.group.rotation.z = Math.sin(this.ang * 2) * 0.05;
    // point the beam at the target
    const local = this.group.worldToLocal(look.clone());
    local.sub(this.beam.position);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), local.normalize());
    this.pool.position.set(look.x, this.game.city.groundAt(look.x, look.z, look.y + 1) + 0.1, look.z);
  }
  remove() { this.group.removeFromParent(); this.pool.removeFromParent(); }
}

// S.H.I.E.L.D. quarantine camp: tents, fences, floodlights and trucks.
export class Camp {
  constructor(game, center) {
    this.game = game; this.center = center.clone();
    const g = (this.group = new THREE.Group());
    g.position.copy(center);
    const tentMat = std(0x5f6650, { roughness: 0.95, side: THREE.DoubleSide });
    const whiteTent = std(0xd8d8d0, { roughness: 0.95, side: THREE.DoubleSide });
    const tentGeo = new THREE.CylinderGeometry(0.01, 3.2, 3.2, 4, 1, true).rotateY(Math.PI / 4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const t = new THREE.Mesh(tentGeo, i % 3 ? tentMat : whiteTent);
      t.scale.set(1.4, 1, 2.2); t.position.set(Math.cos(a) * 16, 1.6, Math.sin(a) * 16); t.rotation.y = -a; t.castShadow = true; g.add(t);
    }
    const post = std(0x3a3a3a, { metalness: 0.6 });
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      box(0.12, 2.2, 0.12, post, Math.cos(a) * 26, 1.1, Math.sin(a) * 26, g);
      const a2 = ((i + 0.5) / 36) * Math.PI * 2;
      const rail = box(4.5, 0.06, 0.06, post, Math.cos(a2) * 26, 2.0, Math.sin(a2) * 26, g);
      rail.rotation.y = -a2 + Math.PI / 2;
    }
    for (const a of [0.4, 2.0, 3.6, 5.2]) {
      box(0.3, 9, 0.3, post, Math.cos(a) * 22, 4.5, Math.sin(a) * 22, g);
      box(1.6, 0.6, 0.6, glow(6, 6, 5.2), Math.cos(a) * 22, 9, Math.sin(a) * 22, g);
    }
    const truck = std(0x1c2433, { roughness: 0.5, metalness: 0.4 });
    for (const [x, z, r] of [[6, -8, 0.3], [-7, 7, 2.2]]) { const b = box(2.4, 2.6, 6.5, truck, x, 1.3, z, g); b.rotation.y = r; }
    game.scene.add(g);
  }
  remove() { this.group.removeFromParent(); }
}

// The S.H.I.E.L.D. Helicarrier: a flying aircraft carrier with a walkable flight deck.
export class Helicarrier {
  constructor(game, pos) {
    this.game = game;
    const g = (this.group = new THREE.Group());
    g.position.copy(pos);
    const hull = std(0x3b4048, { roughness: 0.55, metalness: 0.5 });
    const deckC = document.createElement('canvas'); deckC.width = 256; deckC.height = 1024;
    const dg = deckC.getContext('2d');
    dg.fillStyle = '#2a2d31'; dg.fillRect(0, 0, 256, 1024);
    dg.strokeStyle = '#d8d8c8'; dg.lineWidth = 6; dg.setLineDash([40, 30]);
    dg.beginPath(); dg.moveTo(128, 0); dg.lineTo(128, 1024); dg.stroke();
    dg.setLineDash([]); dg.strokeStyle = '#d8b84a'; dg.lineWidth = 8; dg.strokeRect(20, 20, 216, 984);
    const deckTex = new THREE.CanvasTexture(deckC); deckTex.colorSpace = THREE.SRGBColorSpace;
    const deck = std(0xffffff, { map: deckTex, roughness: 0.8 });
    const W = 46, Lh = 190, H = 14;
    box(W, H, Lh, hull, 0, -H / 2, 0, g);
    const nose = box(W * 0.7, H * 0.8, 24, hull, 0, -H * 0.5, Lh / 2 + 8, g); nose.rotation.x = 0.25;
    box(W - 2, 0.5, Lh - 4, deck, 0, 0.25, 0, g);
    box(10, 26, 30, hull, W / 2 - 7, 13, -20, g);
    box(10.4, 2, 30.4, glow(0.4, 2.5, 4), W / 2 - 7, 22, -20, g);
    this.rotors = [];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const nac = new THREE.Group(); nac.position.set(x * (W / 2 + 14), -6, z * 60); g.add(nac);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(13, 1.2, 8, 32), hull); ring.rotation.x = Math.PI / 2; nac.add(ring);
      box(Math.abs(x) * 14, 2, 3, hull, -x * 7, 0, 0, nac);
      const rot = new THREE.Group(); nac.add(rot);
      for (let b = 0; b < 3; b++) { const bl = box(24, 0.3, 2, std(0x15171a), 0, 0, 0, rot); bl.rotation.y = (b / 3) * Math.PI; }
      this.rotors.push(rot);
    }
    for (let z = -Lh / 2 + 6; z < Lh / 2; z += 12) for (const x of [-W / 2 + 1, W / 2 - 1]) box(0.4, 0.3, 0.4, glow(5, 0.6, 0.4), x, 0.6, z, g);
    game.scene.add(g);
    // collision: deck, hull sides, control tower
    const c = game.city;
    this.deckY = pos.y + 0.5;
    c.addBox({ x0: pos.x - W / 2, y0: pos.y - H, z0: pos.z - Lh / 2, x1: pos.x + W / 2, y1: this.deckY, z1: pos.z + Lh / 2, kind: 'bridge' });
    c.addBox({ x0: pos.x + W / 2 - 12, y0: this.deckY, z0: pos.z - 35, x1: pos.x + W / 2 - 2, y1: this.deckY + 26, z1: pos.z - 5, kind: 'bld' });
    this.pos = pos.clone();
    this.bow = new THREE.Vector3(pos.x, this.deckY, pos.z + Lh / 2 - 20);
    this.stern = new THREE.Vector3(pos.x, this.deckY, pos.z - Lh / 2 + 15);
    this.core = new THREE.Vector3(pos.x - 8, this.deckY, pos.z + 20);
    this.t = 0;
  }
  update(dt) { this.t += dt; for (const r of this.rotors) r.rotation.y += dt * 6; }
  remove() { this.group.removeFromParent(); }
}

// Road waypoints between two street points, staying on the avenue/street grid.
export function roadPath(a, b) {
  const ax = Math.round((a.x - L.X0 - L.AVE / 2) / L.PX), bz = Math.round((b.z - L.Z0 - L.ST / 2) / L.PZ);
  const avX = L.X0 + ax * L.PX + L.AVE / 2 + 2.5;
  const stZ = L.Z0 + bz * L.PZ + L.ST / 2 - 3;
  return [a.clone().setX(avX).setY(0), new THREE.Vector3(avX, 0, stZ), new THREE.Vector3(b.x, 0, stZ), b.clone().setY(0)];
}
