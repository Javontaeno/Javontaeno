import * as THREE from 'three';
import { GLSL_NOISE, rng } from './util.js';
import { CU } from './city.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
class Particles {
  constructor(scene, n, additive) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(size * uScale / max(-mv.z, 0.1), 0.0, 256.0); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
        float a = smoothstep(0.5, 0.0, d); if (a * vA < 0.003) discard; gl_FragColor = vec4(vC, a * vA); }`,
      vertexColors: true,
    });
    this.mat = m;
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(p, count, o = {}) {
    const speed = o.speed ?? 6, spread = o.spread ?? 1, life = o.life ?? 0.6, size = o.size ?? 0.15;
    const c1 = o.color || [1, 1, 1], c2 = o.color2 || c1;
    for (let k = 0; k < count; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.n;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * (o.jitter || 0);
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * (o.jitter || 0);
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * (o.jitter || 0);
      let vx = (Math.random() - 0.5) * 2, vy = (Math.random() - 0.5) * 2, vz = (Math.random() - 0.5) * 2;
      const l = Math.hypot(vx, vy, vz) || 1;
      vx /= l; vy /= l; vz /= l;
      const sp = speed * (0.3 + Math.random() * 0.7);
      const d = o.dir;
      if (d) { vx = d.x + vx * spread; vy = d.y + vy * spread; vz = d.z + vz * spread; }
      this.vel[i * 3] = vx * sp; this.vel[i * 3 + 1] = vy * sp + (o.up || 0); this.vel[i * 3 + 2] = vz * sp;
      const t = Math.random();
      this.col[i * 3] = c1[0] + (c2[0] - c1[0]) * t; this.col[i * 3 + 1] = c1[1] + (c2[1] - c1[1]) * t; this.col[i * 3 + 2] = c1[2] + (c2[2] - c1[2]) * t;
      this.max[i] = this.life[i] = life * (0.6 + Math.random() * 0.6);
      this.s0[i] = size * (0.6 + Math.random() * 0.8);
      this.grav[i] = o.gravity ?? 12;
      this.drag[i] = o.drag ?? 1.5;
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = k;
      this.size[i] = this.s0[i] * (0.4 + 0.6 * k);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
function webCanvas(strands = 26, seed = 3) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = rng(seed);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineCap = 'round';
  for (let i = 0; i < strands; i++) {
    g.lineWidth = 1 + r() * 2.5;
    g.beginPath();
    const a = r() * Math.PI * 2;
    const x = 128 + Math.cos(a) * 140, y = 128 + Math.sin(a) * 140;
    g.moveTo(x, y);
    g.quadraticCurveTo(128 + (r() - 0.5) * 120, 128 + (r() - 0.5) * 120, 128 - Math.cos(a + (r() - 0.5)) * 140, 128 - Math.sin(a + (r() - 0.5)) * 140);
    g.stroke();
  }
  for (let rr = 20; rr < 128; rr += 18 + r() * 10) {
    g.lineWidth = 1.2; g.beginPath(); g.arc(128, 128, rr, 0, Math.PI * 2); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function senseCanvas() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = -3; i <= 3; i++) {
    const a = (i / 3) * 0.9;
    g.beginPath();
    const x0 = 128 + Math.sin(a) * 30, y0 = 118 - Math.cos(a) * 30;
    g.moveTo(x0, y0);
    for (let s = 1; s <= 6; s++) {
      const rr = 30 + s * 13, w = (s % 2 ? 1 : -1) * 8;
      g.lineTo(128 + Math.sin(a) * rr + Math.cos(a) * w, 118 - Math.cos(a) * rr + Math.sin(a) * w);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
class Line {
  constructor(scene, mat) {
    this.mesh = new THREE.Mesh(LINE_GEO, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.life = 0;
  }
  set(a, b, r) {
    const len = _v.copy(b).sub(a).length();
    if (len < 1e-4) { this.mesh.visible = false; return; }
    _v.divideScalar(len);
    _q.setFromUnitVectors(_up, _v);
    this.mesh.position.copy(a);
    this.mesh.quaternion.copy(_q);
    this.mesh.scale.set(r, len, r);
    this.mesh.visible = true;
  }
}
const LINE_GEO = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);

// Tendrils bend along a cubic Bézier evaluated in the vertex shader.
export function tendrilMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x050407, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 1, sheenColor: new THREE.Color(0.35, 0.1, 0.6) });
  m.userData.u = {
    uP0: { value: new THREE.Vector3() }, uP1: { value: new THREE.Vector3() }, uP2: { value: new THREE.Vector3() }, uP3: { value: new THREE.Vector3() },
    uR0: { value: 0.05 }, uR1: { value: 0.012 },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, m.userData.u, { uTime: CU.uTime });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uP0, uP1, uP2, uP3; uniform float uR0, uR1, uTime; varying float vT;
        vec3 bez(float t){ float u = 1.0 - t; return u*u*u*uP0 + 3.0*u*u*t*uP1 + 3.0*u*t*t*uP2 + t*t*t*uP3; }
        vec3 bezT(float t){ float u = 1.0 - t; return normalize(3.0*u*u*(uP1-uP0) + 6.0*u*t*(uP2-uP1) + 3.0*t*t*(uP3-uP2) + vec3(1e-5)); }`)
      .replace('#include <beginnormal_vertex>', `
        float tt = position.z; vT = tt;
        vec3 T = bezT(tt);
        vec3 upv = abs(T.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vec3 Nn = normalize(cross(T, upv)); vec3 Bn = cross(T, Nn);
        vec3 objectNormal = normalize(position.x * Nn + position.y * Bn);`)
      .replace('#include <begin_vertex>', `
        float rad = mix(uR0, uR1, tt) * (1.0 + 0.25 * sin(tt * 28.0 - uTime * 18.0)) * smoothstep(1.0, 0.92, tt) + 0.003;
        vec3 transformed = bez(tt) + objectNormal * rad;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vT; uniform float uTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.5, 0.15, 0.9) * pow(1.0 - abs(fract(vT * 6.0 - uTime * 3.0) - 0.5) * 2.0, 8.0) * 0.6;`);
  };
  return m;
}
export const TENDRIL_GEO = new THREE.CylinderGeometry(1, 1, 1, 8, 32, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);

class Tendril {
  constructor(scene) {
    this.mat = tendrilMaterial();
    this.mesh = new THREE.Mesh(TENDRIL_GEO, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.ext = 0;
    this.target = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.life = 0;
    this.seed = Math.random() * 100;
  }
  update(dt, t) {
    this.life -= dt;
    const want = this.life > 0 ? 1 : 0;
    this.ext += (want - this.ext) * (1 - Math.exp(-(want ? 30 : 12) * dt));
    if (this.ext < 0.01) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const u = this.mat.userData.u;
    const p0 = this.from, p3 = _v.copy(this.from).lerp(this.target, this.ext);
    const d = p3.distanceTo(p0);
    u.uP0.value.copy(p0);
    u.uP3.value.copy(p3);
    const s = this.seed;
    u.uP1.value.copy(p0).lerp(p3, 0.33).add(new THREE.Vector3(Math.sin(t * 7 + s) * d * 0.25, Math.cos(t * 5 + s) * d * 0.25 + d * 0.15, Math.sin(t * 6 + s * 2) * d * 0.2));
    u.uP2.value.copy(p0).lerp(p3, 0.66).add(new THREE.Vector3(Math.cos(t * 8 + s) * d * 0.2, Math.sin(t * 9 + s) * d * 0.2, Math.cos(t * 7 + s * 3) * d * 0.2));
    u.uR0.value = 0.07; u.uR1.value = 0.02;
  }
}

// ---------------------------------------------------------------------------
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.add = new Particles(scene, 3000, true);
    this.dark = new Particles(scene, 1500, false);
    this.webMat = new THREE.MeshStandardMaterial({ color: 0xf2f4ff, emissive: 0x8090b0, emissiveIntensity: 0.5, roughness: 0.4 });
    this.webMatB = new THREE.MeshPhysicalMaterial({ color: 0x0a0a10, emissive: 0x200a40, emissiveIntensity: 1, roughness: 0.2, clearcoat: 1 });
    this.tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.5, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.laserMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.1, 0.1), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    this.swingLine = new Line(scene, this.webMat);
    this.lines = Array.from({ length: 24 }, () => new Line(scene, this.webMat));
    this.tracers = Array.from({ length: 16 }, () => new Line(scene, this.tracerMat));
    this.lasers = Array.from({ length: 8 }, () => new Line(scene, this.laserMat));
    this.tendrils = Array.from({ length: 8 }, () => new Tendril(scene));

    // web projectiles
    this.blobs = Array.from({ length: 16 }, () => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), this.webMat);
      m.visible = false; scene.add(m);
      return { mesh: m, life: 0, vel: new THREE.Vector3(), onHit: null, target: null };
    });
    // web splats on surfaces
    const splatTex = webCanvas(18, 9);
    this.splatMat = new THREE.MeshStandardMaterial({ map: splatTex, transparent: true, alphaTest: 0.2, depthWrite: false, roughness: 0.5, emissive: 0x404858, polygonOffset: true, polygonOffsetFactor: -2 });
    this.splats = Array.from({ length: 30 }, () => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.splatMat);
      m.visible = false; scene.add(m);
      return { mesh: m, life: 0 };
    });
    this.splatI = 0;
    // web cocoons
    const cocoonTex = webCanvas(40, 21);
    cocoonTex.wrapS = cocoonTex.wrapT = THREE.RepeatWrapping;
    cocoonTex.repeat.set(2, 2);
    this.cocoonMat = new THREE.MeshStandardMaterial({ map: cocoonTex, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x303844 });
    this.cocoonGeo = new THREE.CapsuleGeometry(0.36, 1.0, 6, 12).translate(0, 0.9, 0);
    // shockwaves
    this.rings = Array.from({ length: 8 }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m);
      return { mesh: m, life: 0, max: 1, r: 1 };
    });
    // spider-sense icon
    this.sense = new THREE.Sprite(new THREE.SpriteMaterial({ map: senseCanvas(), color: new THREE.Color(3, 1.2, 0.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.sense.scale.set(0.9, 0.45, 1);
    this.sense.visible = false;
    this.sense.renderOrder = 10;
    scene.add(this.sense);
    // drifting embers / ash
    this.emberN = 500;
    const eg = new THREE.BufferGeometry();
    this.emberPos = new Float32Array(this.emberN * 3);
    const r = rng(5);
    for (let i = 0; i < this.emberN; i++) { this.emberPos[i * 3] = (r() - 0.5) * 120; this.emberPos[i * 3 + 1] = (r() - 0.5) * 80; this.emberPos[i * 3 + 2] = (r() - 0.5) * 120; }
    eg.setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3));
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: new THREE.Color(2.0, 0.5, 0.35), size: 0.18, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.embers.frustumCulled = false;
    scene.add(this.embers);
    this.time = 0;
    this.black = false;
    // lightning, coloured lines and ground telegraphs for boss attacks
    this.boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.6, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.boltSegs = Array.from({ length: 90 }, () => new Line(scene, this.boltMat));
    this.lineMats = {};
    this.colorLines = Array.from({ length: 24 }, () => new Line(scene, this.webMat));
    this.teles = Array.from({ length: 10 }, () => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0.2, 0.15), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.visible = disc.visible = false; ring.renderOrder = disc.renderOrder = 4;
      scene.add(ring, disc);
      return { ring, disc, life: 0, max: 1 };
    });
  }

  // Jagged electric arc from a to b.
  lightning(a, b, life = 0.12, jag = 0.6) {
    const n = 8;
    const pts = [a.clone()];
    const d = _v.copy(b).sub(a);
    const len = d.length();
    for (let i = 1; i < n; i++) {
      const p = a.clone().addScaledVector(d, i / n);
      p.x += (Math.random() - 0.5) * jag * len * 0.12; p.y += (Math.random() - 0.5) * jag * len * 0.12; p.z += (Math.random() - 0.5) * jag * len * 0.12;
      pts.push(p);
    }
    pts.push(b.clone());
    for (let i = 0; i < n; i++) {
      const seg = this.boltSegs.find((x) => x.life <= 0) || this.boltSegs[0];
      seg.set(pts[i], pts[i + 1], 0.045);
      seg.life = life;
    }
    this.add.emit(b, 6, { speed: 6, color: [4, 3.6, 1.2], life: 0.25, size: 0.12, gravity: 4 });
  }

  line(a, b, color = 0x111111, life = 0.15, r = 0.02) {
    let m = this.lineMats[color];
    if (!m) m = this.lineMats[color] = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    const l = this.colorLines.find((x) => x.life <= 0) || this.colorLines[0];
    l.mesh.material = m;
    l.set(a, b, r);
    l.life = life;
  }

  // Red ground circle that fills up until an attack lands.
  telegraph(p, radius, dur) {
    const t = this.teles.find((x) => x.life <= 0) || this.teles[0];
    t.ring.position.copy(p); t.disc.position.copy(p);
    t.ring.position.y += 0.06; t.disc.position.y += 0.05;
    t.ring.scale.setScalar(radius);
    t.disc.scale.setScalar(0.01);
    t.r = radius; t.life = t.max = dur;
    t.ring.visible = t.disc.visible = true;
    return t;
  }

  setSuit(black) {
    this.black = black;
    const m = black ? this.webMatB : this.webMat;
    this.swingLine.mesh.material = m;
    for (const l of this.lines) l.mesh.material = m;
    for (const b of this.blobs) b.mesh.material = m;
  }

  webLine(a, b, life = 0.15, r = 0.02) {
    const l = this.lines.find((x) => x.life <= 0) || this.lines[0];
    l.set(a, b, r);
    l.life = life;
    return l;
  }
  tracer(a, b) {
    const l = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    l.set(a, b, 0.03);
    l.life = 0.07;
  }
  laser(i, a, b) { if (this.lasers[i]) { this.lasers[i].set(a, b, 0.012); this.lasers[i].life = 0.05; } }

  shootBlob(from, vel, life, onHit, target) {
    const b = this.blobs.find((x) => x.life <= 0) || this.blobs[0];
    b.mesh.position.copy(from);
    b.vel.copy(vel);
    b.life = life;
    b.onHit = onHit;
    b.target = target;
    b.mesh.visible = true;
    return b;
  }

  splat(p, n, size = 1.2) {
    const s = this.splats[this.splatI++ % this.splats.length];
    s.mesh.position.copy(p).addScaledVector(n, 0.03);
    s.mesh.lookAt(_v.copy(s.mesh.position).add(n));
    s.mesh.rotateZ(Math.random() * 6.28);
    s.mesh.scale.setScalar(size);
    s.mesh.visible = true;
    s.life = 12;
  }

  ring(p, radius, life = 0.45, color) {
    const r = this.rings.find((x) => x.life <= 0) || this.rings[0];
    r.mesh.position.copy(p);
    r.mesh.position.y += 0.08;
    r.life = r.max = life; r.r = radius;
    if (color) r.mesh.material.color.setRGB(...color); else r.mesh.material.color.setRGB(3, 2.6, 2.2);
    r.mesh.visible = true;
  }

  tendril(from, to, life = 0.25) {
    const t = this.tendrils.find((x) => x.life <= 0 && x.ext < 0.05) || this.tendrils.find((x) => x.life <= 0) || this.tendrils[0];
    t.from.copy(from); t.target.copy(to); t.life = life;
    return t;
  }

  hitSpark(p, heavy, black) {
    if (black) {
      this.dark.emit(p, heavy ? 30 : 16, { speed: heavy ? 10 : 7, life: 0.5, size: 0.14, color: [0.02, 0.01, 0.03], gravity: 14 });
      this.add.emit(p, heavy ? 22 : 10, { speed: heavy ? 12 : 8, life: 0.35, size: 0.12, color: [1.6, 0.4, 3.0], color2: [3.0, 0.8, 1.2], gravity: 4 });
    } else {
      this.add.emit(p, heavy ? 26 : 12, { speed: heavy ? 13 : 8, life: 0.3, size: 0.1, color: [3, 2.2, 1.2], color2: [2.5, 1.0, 0.4], gravity: 6 });
    }
    this.add.emit(p, 1, { speed: 0, life: 0.12, size: heavy ? 2.6 : 1.6, color: black ? [1.4, 0.6, 2.4] : [3, 2.7, 2.3], gravity: 0 });
  }

  update(dt, camPos, playerHead, senseAmt) {
    this.time += dt;
    this.add.update(dt);
    this.dark.update(dt);
    for (const t of this.teles) {
      if (t.life <= 0) continue;
      t.life -= dt;
      const k = 1 - t.life / t.max;
      t.disc.scale.setScalar(Math.max(0.01, k * t.r));
      t.ring.material.opacity = 0.6 + 0.4 * Math.sin(this.time * 30);
      if (t.life <= 0) t.ring.visible = t.disc.visible = false;
    }
    for (const l of [...this.lines, ...this.tracers, ...this.lasers, ...this.boltSegs, ...this.colorLines]) {
      if (l.life > 0) { l.life -= dt; if (l.life <= 0) l.mesh.visible = false; }
    }
    for (const t of this.tendrils) t.update(dt, this.time);
    for (const b of this.blobs) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.target) {
        // homing so web shots feel fair against moving targets
        const to = _v.copy(b.target()).sub(b.mesh.position);
        const d = to.length();
        // (hit if it would reach the target this frame: at 60 m/s a blob covers more than the hit radius per frame)
        if (d < Math.max(0.6, b.vel.length() * dt * 1.2)) { b.life = 0; b.mesh.visible = false; b.onHit && b.onHit(b.mesh.position); continue; }
        b.vel.lerp(to.normalize().multiplyScalar(b.vel.length()), Math.min(1, dt * 10));
      }
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.life <= 0) { b.mesh.visible = false; if (!b.target && b.onHit) b.onHit(b.mesh.position); }
    }
    for (const s of this.splats) if (s.life > 0) { s.life -= dt; if (s.life <= 0) s.mesh.visible = false; }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.2 + k * r.r);
      r.mesh.material.opacity = 1 - k;
      if (r.life <= 0) r.mesh.visible = false;
    }
    // spider-sense
    this.sense.visible = senseAmt > 0.01;
    if (this.sense.visible) {
      this.sense.position.copy(playerHead).y += 0.45;
      const s = 0.8 + Math.sin(this.time * 30) * 0.08;
      this.sense.scale.set(s * 1.0, s * 0.5, 1);
      this.sense.material.opacity = Math.min(1, senseAmt * 2);
    }
    // embers drift and wrap around the camera
    const e = this.emberPos;
    for (let i = 0; i < this.emberN; i++) {
      e[i * 3] += Math.sin(this.time * 0.5 + i) * dt * 0.6 + dt * 0.8;
      e[i * 3 + 1] += dt * (0.4 + (i % 7) * 0.1);
      e[i * 3 + 2] += Math.cos(this.time * 0.4 + i * 1.3) * dt * 0.6;
      for (let a = 0; a < 3; a++) {
        const half = a === 1 ? 40 : 60;
        const c = a === 0 ? camPos.x : a === 1 ? camPos.y : camPos.z;
        let v = e[i * 3 + a] - c;
        if (v > half) v -= half * 2; else if (v < -half) v += half * 2;
        e[i * 3 + a] = c + v;
      }
    }
    this.embers.geometry.attributes.position.needsUpdate = true;
  }
}
void GLSL_NOISE;
