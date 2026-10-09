import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Props and costume pieces attached to a Character's skeleton (hair, claws, capes, wings...).
const std = (ch, color, o = {}) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
  (ch.accMats || (ch.accMats = [])).push(m);
  return m;
};
const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
};

function hair(ch, style, color) {
  const head = ch.j.head, k = ch.bulk * 0.97;
  const mat = std(ch, color, { roughness: 0.55 });
  const g = new THREE.Group();
  g.position.set(0, 0.085, 0.012); g.scale.setScalar(k);
  head.add(g);
  if (style === 'balding') {
    add(g, new THREE.SphereGeometry(0.118, 20, 12, Math.PI * 0.85, Math.PI * 1.3, Math.PI * 0.35, Math.PI * 0.3), mat, 0, -0.005, -0.004, 0, 0, 0, 0.95, 1.1, 1.06);
    return;
  }
  // crown cap
  add(g, new THREE.SphereGeometry(0.121, 28, 16, 0, Math.PI * 2, 0, Math.PI * (style === 'short' ? 0.42 : 0.5)), mat, 0, 0.004, -0.006, -0.12, 0, 0, 0.94, 1.1, 1.07);
  if (style === 'long') {
    add(g, new THREE.SphereGeometry(1, 18, 14), mat, 0, -0.07, -0.06, 0.15, 0, 0, 0.1, 0.19, 0.055);
    for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(1, 12, 10), mat, s * 0.088, -0.035, -0.005, 0.1, 0, s * 0.12, 0.028, 0.12, 0.05);
  }
}

function blade(len) {
  return new THREE.BoxGeometry(0.006, len, 0.012).translate(0, -len / 2, 0);
}

export function addAccessories(ch, look) {
  const j = ch.j, k = ch.bulk;
  const acc = (ch.acc = {});
  for (const a of look.acc) {
    switch (a) {
      case 'hairShort': hair(ch, 'short', look.hair || '#2a1a10'); break;
      case 'hairLong': hair(ch, 'long', look.hair || '#2a1a10'); break;
      case 'hairBalding': hair(ch, 'balding', look.hair || '#d8d8d8'); break;
      case 'claws': {
        const m = std(ch, 0xdfe4ea, { metalness: 1, roughness: 0.18 });
        const geo = blade(0.3);
        acc.claws = [];
        for (const sd of ['L', 'R']) {
          const g = new THREE.Group();
          g.position.set(0, -0.07, 0.0);
          for (const z of [-0.022, 0, 0.022]) add(g, geo, m, 0, 0, z);
          j['ha' + sd].add(g);
          acc.claws.push(g);
        }
        break;
      }
      case 'wolvFins': {
        const m = std(ch, 0x0b0b0b, { roughness: 0.5 });
        for (const s of [-1, 1]) add(j.head, new THREE.ConeGeometry(0.03, 0.13, 6), m, s * 0.068 * k, 0.2 * k, -0.005, -0.25, 0, -s * 0.55, 1, 1, 0.35);
        break;
      }
      case 'hood': {
        const m = std(ch, look.top || 0xe9ebee, { roughness: 0.75, side: THREE.DoubleSide });
        add(j.head, new THREE.SphereGeometry(0.14, 24, 16, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, Math.PI * 0.72), m, 0, 0.085, -0.004, 0, 0, 0, k, k * 1.05, k * 1.08);
        break;
      }
      case 'cape': {
        // tapered drape: narrow at the shoulders, wider and wrapped at the hem
        const geo = new THREE.PlaneGeometry(1, 1.3, 8, 12).translate(0, -0.65, 0);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), v = -y / 1.3;
          const width = 0.38 + 0.38 * v;
          const xx = x * width;
          p.setXYZ(i, xx, y, -0.16 * (xx / 0.38) ** 2 - 0.05 * v + Math.sin(x * 9) * 0.012 * v);
        }
        geo.computeVertexNormals();
        const m = std(ch, look.capeColor || 0xe9ebee, { roughness: 0.85, side: THREE.DoubleSide });
        const pivot = new THREE.Group();
        pivot.position.set(0, 0.27, -0.13 * k);
        j.chest.add(pivot);
        add(pivot, geo, m, 0, 0, 0, 0, 0, 0, k, 1, 1);
        acc.cape = pivot;
        break;
      }
      case 'wings': {
        // feathered wing silhouette with a scalloped trailing edge, painted feather by feather
        const sh = new THREE.Shape();
        sh.moveTo(0, 0.05);
        sh.quadraticCurveTo(0.45, 0.42, 1.0, 0.5);
        sh.quadraticCurveTo(1.35, 0.52, 1.62, 0.36);
        const tips = 8;
        for (let i = 0; i <= tips; i++) {
          const t = i / tips;
          const x = 1.55 - t * 1.45, y = 0.3 - Math.sin(t * Math.PI * 0.55) * 0.95;
          sh.lineTo(x + 0.06, y + 0.12);
          sh.lineTo(x, y);
        }
        sh.lineTo(0.02, -0.35);
        sh.closePath();
        const geo = new THREE.ShapeGeometry(sh, 6);
        const uv = geo.attributes.uv, pos = geo.attributes.position;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 1.7, (pos.getY(i) + 0.75) / 1.3);
        const c = document.createElement('canvas'); c.width = 256; c.height = 256;
        const g2 = c.getContext('2d');
        const grd = g2.createLinearGradient(0, 0, 256, 0); grd.addColorStop(0, '#1d4a26'); grd.addColorStop(1, '#2f7a3c');
        g2.fillStyle = grd; g2.fillRect(0, 0, 256, 256);
        g2.strokeStyle = 'rgba(10,30,14,0.8)'; g2.lineWidth = 3;
        for (let i = 0; i < 16; i++) { g2.beginPath(); g2.moveTo(20 + i * 3, 220); g2.lineTo(30 + i * 15, 40 + i * 4); g2.stroke(); }
        g2.fillStyle = 'rgba(200,230,200,0.25)';
        for (let i = 0; i < 9; i++) g2.fillRect(150 + i * 10, 150 - i * 12, 6, 70);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const m = std(ch, 0xffffff, { map: tex, roughness: 0.75, side: THREE.DoubleSide });
        acc.wings = [];
        for (const s of [1, -1]) {
          const g = new THREE.Group();
          g.position.set(s * 0.09 * k, 0.24, -0.14 * k);
          add(g, geo, m, 0, 0, 0, 0, 0, 0, s, 1, 1);
          j.chest.add(g);
          acc.wings.push(g);
        }
        break;
      }
      case 'collar': add(j.chest, new THREE.TorusGeometry(0.1 * k, 0.035, 8, 18), std(ch, look.collarColor || 0xf2f2ee, { roughness: 0.95 }), 0, 0.27, -0.01, Math.PI / 2, 0, 0, 1.2, 1, 1); break;
      case 'cuffs': {
        const m = std(ch, 0xf2f2ee, { roughness: 1 });
        for (const sd of ['L', 'R']) {
          add(j['el' + sd], new THREE.TorusGeometry(0.048 * k, 0.022, 8, 14), m, 0, -0.22, 0, Math.PI / 2);
          add(j['kn' + sd], new THREE.TorusGeometry(0.055 * k, 0.024, 8, 14), m, 0, -0.36, 0, Math.PI / 2);
        }
        break;
      }
      case 'belt': add(j.hips, new THREE.TorusGeometry(0.15 * k, 0.018, 6, 24), std(ch, look.beltColor || 0x9aa0a6, { metalness: 0.8, roughness: 0.3 }), 0, 0.07, 0, Math.PI / 2, 0, 0, 1.12 * (look.build === 'female' ? 1.1 : 1), 0.84, 1); break;
      case 'tiara': add(j.head, new THREE.TorusGeometry(0.108 * k, 0.012, 6, 24), std(ch, 0xb8bec6, { metalness: 0.9, roughness: 0.25 }), 0, 0.13 * k, 0.012, Math.PI / 2 - 0.15, 0, 0, 0.9, 1.05, 1); break;
      case 'cane': add(j.fiR, new THREE.CylinderGeometry(0.014, 0.018, 1.0, 8).translate(0, -0.42, 0), std(ch, 0x2a1d3a, { roughness: 0.3, metalness: 0.4 }), 0, 0, 0.02); break;
      case 'bat': {
        const g = add(j.fiR, new THREE.CylinderGeometry(0.035, 0.016, 0.84, 10).translate(0, 0.38, 0), std(ch, 0xb08850, { roughness: 0.5 }), 0, -0.03, 0.02, Math.PI / 2 + 0.2);
        acc.bat = g;
        break;
      }
      case 'pistol': case 'rifle': {
        const m = std(ch, 0x161616, { metalness: 0.6, roughness: 0.4 });
        const len = a === 'rifle' ? 0.7 : 0.2;
        const g = new THREE.Group();
        add(g, new THREE.BoxGeometry(0.035, 0.05, len).translate(0, 0, len * 0.4), m);
        add(g, new THREE.BoxGeometry(0.03, 0.1, 0.04), m, 0, -0.06, 0, 0.25);
        if (a === 'rifle') add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), m, 0, 0.05, 0.1, Math.PI / 2);
        const tip = new THREE.Object3D(); tip.position.set(0, 0, len * 0.9); g.add(tip);
        g.position.set(0, -0.08, 0.02);
        j.haR.add(g);
        acc.gun = g; acc.tip = tip;
        break;
      }
      case 'visor': {
        const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.25, 0.2) });
        (ch.accMats || (ch.accMats = [])).push(m);
        add(j.head, new THREE.TorusGeometry(0.105 * k, 0.014, 4, 20, Math.PI * 0.9), m, 0, 0.1 * k, 0.012, 0, 0, Math.PI * 0.05 + Math.PI, 1, 0.6, 1).rotation.set(Math.PI / 2, 0, Math.PI * 0.55);
        break;
      }
      case 'electroStar': {
        const m = std(ch, look.accent || 0xf2d21b, { emissive: new THREE.Color(0.6, 0.5, 0.05), roughness: 0.4 });
        const g = new THREE.Group(); g.position.set(0, 0.095 * k, 0.1 * k); j.head.add(g);
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 + Math.PI / 2;
          const c = add(g, new THREE.ConeGeometry(0.022, 0.13, 5), m, Math.cos(ang) * 0.07, Math.sin(ang) * 0.07, 0, 0, 0, ang - Math.PI / 2);
          c.scale.set(1, 1, 0.4);
        }
        break;
      }
      case 'tongue': {
        const t = add(j.head, new THREE.ConeGeometry(0.025, 0.22, 8).translate(0, 0.11, 0), std(ch, 0xb0122a, { roughness: 0.25, emissive: 0x200004 }), 0, 0.045 * k, 0.1 * k, 1.9);
        acc.tongue = t;
        break;
      }
      case 'spines': {
        const m = std(ch, 0x060508, { roughness: 0.2, metalness: 0.2 });
        acc.spines = [];
        for (let i = 0; i < 4; i++) acc.spines.push(add(j.chest, new THREE.ConeGeometry(0.03, 0.55, 6).translate(0, 0.27, 0), m, (i - 1.5) * 0.07, 0.15, -0.13, -0.9, 0, (i - 1.5) * 0.35));
        break;
      }
    }
  }
}

// Per-frame costume motion: cape sway, wing flaps, tongue.
export function animateAccessories(ch, dt, o = {}) {
  const a = ch.acc;
  if (!a) return;
  const t = o.t || 0;
  if (a.cape) a.cape.rotation.x = -Math.min(1.1, (o.speed || 0) * 0.05) - 0.08 + Math.sin(t * 2.7) * 0.05;
  if (a.wings) {
    // spread and beating in flight, folded down behind the back otherwise
    const open = o.fly ? 1 : 0;
    const flap = o.fly ? Math.sin(t * (o.flapRate || 5)) * 0.5 : 0;
    a.wings.forEach((g, i) => {
      const s = i === 0 ? 1 : -1;
      g.rotation.set(0.1, s * (0.25 + (1 - open) * 1.15), s * (flap - (1 - open) * 0.9));
    });
  }
  if (a.tongue) { const v = 0.6 + Math.max(0, Math.sin(t * 1.7)) * 0.6; a.tongue.scale.set(1, v, 1); }
  if (a.claws && o.claws !== undefined) for (const c of a.claws) c.visible = o.claws;
}
