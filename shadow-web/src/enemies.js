import * as THREE from 'three';
import { Character, P, ACT, evalAction, Pose } from './character.js';
import { animateAccessories } from './accessories.js';
import { L } from './city.js';
import { clamp, damp, dampAngle, rng, lerp } from './util.js';

const G = 30;
const TYPES = {
  thug: { hp: 55, speed: 5.6, reach: 2.3, dmg: 9, atkDur: 0.95, atk: 'punch', kind: 'thug', xp: 25 },
  pipe: { hp: 70, speed: 5.0, reach: 2.8, dmg: 14, atkDur: 1.15, atk: 'pipe', kind: 'thug', weapon: 'pipe', xp: 35, blocks: 0.75 },
  gunner: { hp: 40, speed: 5.0, reach: 0, dmg: 6, kind: 'gunner', ranged: true, weapon: 'gun', xp: 30 },
  crawler: { hp: 65, speed: 8.5, reach: 2.3, dmg: 10, atkDur: 0.8, atk: 'slash', kind: 'symbiote', leap: true, xp: 35, evade: 0.3 },
  brute: { hp: 320, speed: 4.0, reach: 3.8, dmg: 20, atkDur: 1.35, atk: 'smash', kind: 'brute', heavy: true, radius: 0.95, xp: 150 },
  // symbiote-controlled civilians: two arms, two legs, two eyes — never spider-like
  infected: { hp: 60, speed: 7.6, reach: 2.2, dmg: 9, atkDur: 0.8, atk: 'slash', kind: 'thug', crawl: true, leap: true, xp: 30, evade: 0.15, infected: true },
  assassin: { hp: 60, speed: 4.5, reach: 0, dmg: 14, kind: 'thug', build: 'lean', ranged: true, sniper: true, xp: 45 },
  henchman: { hp: 60, speed: 5.6, reach: 2.3, dmg: 10, atkDur: 0.95, atk: 'punch', kind: 'thug', xp: 28, suit: true },
  hgun: { hp: 45, speed: 5.0, reach: 0, dmg: 7, kind: 'gunner', ranged: true, weapon: 'gun', xp: 32, suit: true },
  leader: { hp: 140, speed: 5.2, reach: 2.5, dmg: 12, atkDur: 1.0, atk: 'punch', kind: 'thug', build: 'big', xp: 80, blocks: 0.4 },
};
const GANGS = {
  r7: { jacket: '#8a1414', bandana: '#c81e1e', stripe: '#e8e8e8' },
  pa: { jacket: '#1b3f8a', bandana: '#2a62c9', stripe: '#d8c060' },
};
const CIVVY = ['#6a7f9a', '#b4a58a', '#7a3b4a', '#3f6a5a', '#9a9a9a', '#c48a3a', '#4a4a6a'];
const JACKETS = ['#2b2f36', '#5a1e1e', '#1f3b2a', '#3b2a1a', '#1d2747', '#4a4a4a', '#6b5a2a', '#232323'];
const PANTS = ['#2a3a5a', '#1f2a3f', '#333333', '#3a3326', '#26303a'];
const SKINS = ['#e0b49a', '#c68f6e', '#8d5a3c', '#5e3b26', '#f1c9ae', '#a8714f'];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _n = new THREE.Vector3();
let ENEMY_ID = 0;

function makeWeapon(kind) {
  const g = new THREE.Group();
  if (kind === 'pipe') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.95, 8), new THREE.MeshStandardMaterial({ color: 0x5b5f63, metalness: 0.8, roughness: 0.35 }));
    m.position.set(0, -0.05, 0.38); m.rotation.x = Math.PI / 2;
    m.castShadow = true;
    g.add(m);
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.6, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.2), mat); body.position.set(0, -0.02, 0.08);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.04), mat); grip.position.set(0, -0.06, 0.0); grip.rotation.x = 0.25;
    g.add(body, grip);
    g.userData.tip = new THREE.Object3D(); g.userData.tip.position.set(0, -0.01, 0.2); g.add(g.userData.tip);
  }
  return g;
}

export class Enemy {
  constructor(game, type, pos, ev, opts = {}) {
    this.id = ENEMY_ID++;
    this.game = game; this.type = type; this.cfg = { ...TYPES[type], ...(opts.cfg || {}) }; this.ev = ev;
    this.name = opts.name || null;
    const r = rng(this.id * 31 + 7);
    const sym = this.cfg.kind === 'symbiote' || this.cfg.kind === 'brute';
    let look = sym ? { symbiote: true, seed: this.id } : {
      seed: this.id, jacket: JACKETS[Math.floor(r() * JACKETS.length)], pants: PANTS[Math.floor(r() * PANTS.length)],
      skin: SKINS[Math.floor(r() * SKINS.length)], shoe: r() < 0.5 ? '#e8e8e8' : '#1a1a1a', hair: '#1a1410',
      hat: r() < 0.45 ? ['#222', '#7a1a1a', '#1a3a5a', '#3a3a3a'][Math.floor(r() * 4)] : null,
      stripe: r() < 0.35 ? '#c9c9c9' : null, rolled: r() < 0.3, mask: type === 'gunner' && r() < 0.6 ? 'bandana' : null, bandana: '#141414',
    };
    if (this.cfg.infected) look = { ...look, jacket: CIVVY[Math.floor(r() * CIVVY.length)], hat: null, stripe: null, goo: true, topKind: r() < 0.5 ? 'tee' : 'jacket' };
    if (this.cfg.suit) look = { ...look, jacket: '#141418', topKind: 'suit', tie: '#1a1a1a', shirt: '#e8e8e8', pants: '#141418', shoe: '#0c0c0c', hat: null, stripe: null, mask: null };
    if (type === 'assassin') look = { ...look, jacket: '#2a2d33', topKind: 'body', pattern: 'armor', accent: '#b0161c', mask: 'visor', gloves: '#141416', boots: '#141416', hat: null, stripe: null, acc: ['visor', 'rifle'] };
    if (opts.gang && GANGS[opts.gang]) look = { ...look, ...GANGS[opts.gang], mask: r() < 0.5 ? 'bandana' : null, hat: null };
    if (opts.look) look = opts.lookExact ? { seed: this.id, ...opts.look } : { ...look, ...opts.look };
    if (this.cfg.build) look.build = look.build || this.cfg.build;
    this.char = new Character(this.cfg.kind, look);
    game.scene.add(this.char.root);
    if (this.cfg.weapon) {
      this.weapon = makeWeapon(this.cfg.weapon);
      (this.cfg.weapon === 'gun' ? this.char.j.haR : this.char.j.fiR).add(this.weapon);
      if (this.cfg.weapon === 'gun') this.weapon.position.set(0, -0.08, 0.02);
    }
    this.scale = this.char.scale;
    this.maxHp = this.hp = Math.round((opts.hp || this.cfg.hp) * (1 + 0.12 * (game.level - 1)));
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = r() * Math.PI * 2;
    this.state = 'idle'; this.t = 0;
    this.alerted = false;
    this.threatT = -1; this.targetsPlayer = false; this.token = false;
    this.cd = 0.4 + r() * 1.6;
    this.webLevel = 0; this.webT = 0; this.cocoon = null;
    this.juggleT = 0; this.flashT = 0;
    this.strafe = r() < 0.5 ? 1 : -1; this.strafeT = 2 + r() * 2;
    this.phase = r() * 10;
    this.armor = 0; this.armorBroken = 0;
    this.base = new Pose(); this.tgt = new Pose();
    this.shots = 0;
    this.removed = false;
    this.stun = 0;
    this.spin = 0;
    this.home = this.pos.clone();
  }

  get alive() { return this.state !== 'ko' && this.state !== 'dead' && !this.removed; }
  get targetable() { return this.alive; }
  get airborne() { return this.state === 'air' || this.state === 'yanked' || this.state === 'leapAir'; }
  get heavy() { return !!this.cfg.heavy; }
  get canLaunch() { return !this.cfg.heavy || this.armorBroken > 0; }
  get radius() { return this.cfg.radius || 0.45; }
  chest(out = new THREE.Vector3()) {
    if (this.state === 'down' || this.state === 'dead') return out.copy(this.pos).setY(this.pos.y + 0.35);
    return out.copy(this.pos).setY(this.pos.y + 1.3 * this.scale);
  }

  releaseToken() {
    if (this.token) { this.token = false; this.game.tokens.delete(this); }
    this.targetsPlayer = false;
    this.threatT = -1;
  }

  setState(s) { this.state = s; this.t = 0; }
  face(p) { this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }

  // ------------------------------------------------------------------------
  update(dt) {
    const g = this.game, pl = g.player;
    if (g.story && g.story.cine) { this.releaseToken(); this.physics(dt); this.animate(dt); return; }
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.char.setFlash(this.flashT > 0 ? 0.16 : 0);
    this.armorBroken = Math.max(0, this.armorBroken - dt);
    this.armor = Math.max(0, this.armor - dt * 15);
    this.juggleT = Math.max(0, this.juggleT - dt);
    this.cd -= dt;
    this.strafeT -= dt;
    if (this.strafeT < 0) { this.strafe *= -1; this.strafeT = 1.5 + Math.random() * 2.5; }

    const toP = _v.copy(pl.pos).sub(this.pos);
    const dy = toP.y; toP.y = 0;
    const dH = toP.length();
    if (!this.alerted && ((dH < 38 && Math.abs(dy) < 25) || (this.ev && this.ev.alerted) || this.hp < this.maxHp)) {
      this.alerted = true;
      if (this.ev) this.ev.alerted = true;
    }
    const playerDead = pl.state === 'dead';
    const sameLevel = Math.abs(dy) < 2.6 && pl.state !== 'wall' && pl.state !== 'swing';
    const faceP = () => { if (dH > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(toP.x, toP.z), 10, dt); };

    switch (this.state) {
      case 'idle':
        if (this.alerted && !playerDead) this.setState(this.cfg.ranged ? 'circle' : 'chase');
        break;
      case 'chase': {
        if (playerDead) { this.setState('idle'); this.alerted = false; break; }
        faceP();
        if (!sameLevel && !(this.cfg.leap && dH < 16 && Math.abs(dy) < 16)) { this.setState('circle'); break; }
        if (dH > 4.6) this.walk(toP.normalize(), this.cfg.speed, dt);
        else this.setState('circle');
        if (this.cfg.leap && this.cd <= 0 && dH > 5 && dH < 15 && Math.random() < dt * 1.5) this.tryLeap();
        break;
      }
      case 'circle': {
        if (playerDead) { this.setState('idle'); this.alerted = false; break; }
        faceP();
        if (this.cfg.ranged) {
          const want = this.cfg.sniper ? 0 : dH < 9 ? -1 : dH > 22 ? 1 : 0;
          const dir = _v2.copy(toP).normalize();
          const tang = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafe * 0.6);
          this.walk(dir.multiplyScalar(want).add(tang), this.cfg.speed * 0.7, dt);
          if (this.cd <= 0 && dH < (this.cfg.sniper ? 80 : 35) && this.game.requestToken(this, true)) { this.setState('aim'); }
          break;
        }
        if (this.cfg.leap && this.cd <= 0 && dH > 4.5 && dH < 15 && Math.abs(dy) < 15 && Math.random() < dt * 1.2) { this.tryLeap(); break; }
        if (!sameLevel) { break; }
        if (dH > 7) { this.setState('chase'); break; }
        const dir = _v2.copy(toP).normalize();
        const radial = dH < 3.4 ? -0.8 : dH > 5.2 ? 0.8 : 0;
        const tang = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafe * 0.55);
        this.walk(dir.multiplyScalar(radial).add(tang), this.cfg.speed * 0.45, dt);
        if (this.cd <= 0 && this.game.requestToken(this, false)) { this.setState('approach'); }
        break;
      }
      case 'approach': {
        faceP();
        if (dH > this.cfg.reach * 0.8) this.walk(_v2.copy(toP).normalize(), this.cfg.speed * 1.3, dt);
        if (dH <= this.cfg.reach * 0.9 || this.t > 1.6) { this.setState('attack'); this.targetsPlayer = true; this.perfectDodged = false; }
        if (!sameLevel) { this.releaseToken(); this.setState('circle'); }
        break;
      }
      case 'attack': {
        const dur = this.cfg.atkDur, hitT = ACT[this.cfg.atk].hit * dur;
        if (this.t < hitT - 0.12) faceP();
        this.threatT = this.t < hitT ? hitT - this.t : -1;
        if (this.t < hitT && dH > this.cfg.reach * 0.7) this.walk(_v2.copy(toP).normalize(), 2.5, dt);
        if (this.t >= hitT && !this.didHit) {
          this.didHit = true;
          this.strike(dH, toP, dy);
        }
        if (this.t >= dur) { this.didHit = false; this.releaseToken(); this.cd = 0.9 + Math.random() * 1.6; this.setState(this.perfectDodged ? 'stagger' : 'circle'); if (this.perfectDodged) this.stun = 1.2; }
        break;
      }
      case 'aim': {
        faceP();
        const dur = this.cfg.sniper ? 1.6 : 1.05;
        this.targetsPlayer = true;
        this.threatT = dur - this.t;
        const tip = this.gunTip(_v2);
        const pc = pl.chestPos(new THREE.Vector3());
        g.fx.laser(this.id % 8, tip, pc);
        if (this.t >= dur) { this.setState('fire'); this.shots = 0; this.threatT = -1; }
        break;
      }
      case 'fire': {
        faceP();
        if (this.t > this.shots * 0.13 && this.shots < (this.cfg.sniper ? 1 : 3)) {
          this.shots++;
          const tip = this.gunTip(_v2);
          const pc = pl.chestPos(new THREE.Vector3());
          const fast = pl.vel.length() > 18;
          const miss = this.perfectDodged || pl.invuln > 0 || Math.random() < (fast ? 0.75 : this.cfg.sniper ? 0.15 : 0.25);
          if (miss) pc.add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 3));
          g.fx.tracer(tip, pc);
          g.fx.add.emit(tip, 4, { speed: 3, color: [4, 2.5, 0.8], life: 0.08, size: 0.25, gravity: 0 });
          g.audio.gun(dH);
          if (!miss) pl.hurt(this.cfg.dmg, this.pos, 'bullet');
        }
        if (this.t > 0.6) { this.releaseToken(); this.cd = 2.2 + Math.random() * 2.5; this.perfectDodged = false; this.setState('circle'); }
        break;
      }
      case 'leapWind': {
        faceP();
        this.threatT = 0.42 - this.t + 0.3;
        this.targetsPlayer = true;
        if (this.t > 0.42) {
          // ballistic leap at where the player will be
          const T = 0.55;
          const tp = _v2.copy(pl.pos).addScaledVector(pl.vel, T * 0.6);
          tp.y += 1.0;
          this.vel.set((tp.x - this.pos.x) / T, (tp.y - this.pos.y + 0.5 * G * T * T) / T, (tp.z - this.pos.z) / T);
          this.setState('leapAir');
          this.didHit = false;
          g.audio.screech();
        }
        break;
      }
      case 'leapAir': {
        this.threatT = -1;
        if (!this.didHit && this.chest(_v2).distanceTo(pl.chestPos(new THREE.Vector3())) < 1.8) {
          this.didHit = true;
          if (!this.perfectDodged) pl.hurt(this.cfg.dmg, this.pos);
        }
        break;
      }
      case 'stagger':
        if (this.t > (this.stun || 0.4)) this.setState('circle');
        break;
      case 'down':
        if (this.t > 1.5) this.setState('getup');
        break;
      case 'getup':
        if (this.t > 0.8) { this.setState('circle'); this.cd = 0.8 + Math.random(); }
        break;
      case 'webbed':
        this.webT -= dt;
        if (this.webT <= 0) this.unweb();
        break;
      case 'yanked': {
        const tp = _v2.copy(pl.pos).addScaledVector(new THREE.Vector3(Math.sin(pl.yaw), 0, Math.cos(pl.yaw)), 1.3);
        const to = tp.sub(this.pos);
        const d = to.length();
        if (d < 1.0 || this.t > 0.6) { this.vel.multiplyScalar(0.1); this.setState('stagger'); this.stun = 0.9; }
        else this.vel.copy(to.normalize().multiplyScalar(24)).setY(Math.max(this.vel.y, 1));
        break;
      }
      case 'dead':
        if (this.t > 3.5) {
          this.pos.y -= dt * 0.6;
          if (this.t > 5.5) this.remove();
        }
        break;
    }
    this.physics(dt);
    this.animate(dt);
  }

  tryLeap() {
    this.cd = 2.5 + Math.random() * 2;
    if (!this.game.requestToken(this, false)) return;
    this.setState('leapWind');
    this.perfectDodged = false;
  }

  strike(dH, toP, dy) {
    const g = this.game, pl = g.player;
    if (this.type === 'brute') {
      // ground-pound shockwave
      g.fx.ring(this.pos, 7, 0.5, [2.4, 0.4, 0.6]);
      g.fx.dark.emit(this.pos, 30, { speed: 9, color: [0.02, 0.01, 0.02], life: 0.7, size: 0.2, up: 4 });
      g.cam.shake(dH < 15 ? 0.35 : 0.1);
      g.audio.land(true);
      if (dH < this.cfg.reach + 0.6 && Math.abs(dy) < 2 && !this.perfectDodged) pl.hurt(this.cfg.dmg, this.pos);
      return;
    }
    const facing = _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const inFront = dH < 0.6 || toP.clone().normalize().dot(facing) > 0.3;
    if (dH < this.cfg.reach + 0.4 && inFront && Math.abs(dy) < 2 && !this.perfectDodged) {
      if (pl.hurt(this.cfg.dmg, this.pos)) g.fx.hitSpark(pl.chestPos(new THREE.Vector3()), false, false);
    } else g.audio.whoosh(false);
  }

  gunTip(out) {
    if (this.weapon && this.weapon.userData.tip) return this.weapon.userData.tip.getWorldPosition(out);
    if (this.char.acc && this.char.acc.tip) return this.char.acc.tip.getWorldPosition(out);
    return this.chest(out);
  }

  walk(dir, speed, dt) {
    const g = this.game;
    const nx = this.pos.x + dir.x * speed * dt, nz = this.pos.z + dir.z * speed * dt;
    const gy = g.city.groundAt(nx, nz, this.pos.y);
    if (Math.abs(gy - this.pos.y) > 1.2) return; // don't walk off ledges
    this.pos.x = nx; this.pos.z = nz;
    this.moving = speed * Math.min(1, dir.length());
  }

  physics(dt) {
    const g = this.game, city = g.city;
    const grounded = !['air', 'ko', 'yanked', 'leapAir'].includes(this.state) && !(this.state === 'webbed' && this.stuck);
    // separation
    if (this.alive) {
      for (const o of g.enemies) {
        if (o === this || !o.alive) continue;
        const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz, min = this.radius + o.radius + 0.35;
        if (d2 < min * min && d2 > 1e-6 && Math.abs(this.pos.y - o.pos.y) < 2) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          this.pos.x += (dx / d) * push; this.pos.z += (dz / d) * push;
        }
      }
      // keep out of the player's body
      const pl = g.player;
      const dx = this.pos.x - pl.pos.x, dz = this.pos.z - pl.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.85 * 0.85 && d2 > 1e-6 && Math.abs(this.pos.y - pl.pos.y) < 1.5) { const d = Math.sqrt(d2); this.pos.x += (dx / d) * (0.85 - d); this.pos.z += (dz / d) * (0.85 - d); }
    }
    if (grounded) {
      this.vel.y = 0;
      this.vel.x *= Math.exp(-6 * dt); this.vel.z *= Math.exp(-6 * dt);
      const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
      this.pos.x = nx; this.pos.z = nz;
      const gy = city.groundAt(this.pos.x, this.pos.z, this.pos.y);
      if (this.pos.y - gy > 0.7 && this.state !== 'dead') {
        // knocked off a ledge
        if (this.alive) this.setState('air'); else this.state = 'ko';
      } else this.pos.y = gy;
    } else if (!(this.state === 'webbed' && this.stuck)) {
      const grav = this.juggleT > 0 ? G * 0.22 : G;
      this.vel.y -= grav * dt;
      if (this.juggleT > 0) this.vel.y = Math.max(this.vel.y, -4);
      this.pos.addScaledVector(this.vel, dt);
      this.spin += dt * (this.state === 'ko' ? 9 : 0);
      const gy = city.groundAt(this.pos.x, this.pos.z, this.pos.y);
      if (this.pos.y <= gy && this.vel.y <= 0) {
        this.pos.y = gy;
        const impact = -this.vel.y;
        if (this.state === 'ko') { this.setState('dead'); this.vel.set(0, 0, 0); g.fx.add.emit(this.pos, 10, { speed: 4, color: [0.5, 0.45, 0.4], life: 0.5, size: 0.25 }); this.onDeathLand(); }
        else if (this.state === 'leapAir') { this.setState('circle'); this.releaseToken(); this.vel.set(0, 0, 0); }
        else if (this.state === 'webbed') { this.vel.set(0, 0, 0); }
        else if (this.state === 'yanked') { this.setState('stagger'); this.stun = 0.6; }
        else {
          if (this.spiked) { g.fx.ring(this.pos, 4, 0.4); g.cam.shake(0.2); this.hp -= 8; this.spiked = false; }
          if (impact > 26 && this.fallStart - this.pos.y > 14 && !this.isBoss) { this.hp = 0; }
          if (this.hp <= 0) { this.ko(new THREE.Vector3(0, 0, 0), { kb: 0 }); this.setState('dead'); this.onDeathLand(); }
          else { this.setState('down'); }
          this.vel.set(0, 0, 0);
        }
      }
      if (!city.onIsland(this.pos.x, this.pos.z) && this.pos.y < 0) { this.hp = 0; if (this.alive) this.ko(_n.set(0, 0, 0), {}); }
      if (this.pos.y < L.WATER_Y - 2) this.remove();
    }
    if (this.state === 'air' && this.fallStart === undefined) this.fallStart = this.pos.y;
    if (grounded) this.fallStart = undefined;
    // walls
    const c = _v2.copy(this.pos); c.y += 0.9 * this.scale;
    if (city.collide(c, this.radius, _n)) {
      this.pos.x = c.x; this.pos.z = c.z;
      if (_n.y > 0.5 && !grounded) this.pos.y = c.y - 0.9 * this.scale;
      if (Math.abs(_n.y) < 0.4) {
        const into = this.vel.dot(_n);
        if (into < 0) this.vel.addScaledVector(_n, -into * 1.4);
        if (this.state === 'webbed' && !grounded) this.stuck = true; // webbed to the wall
      }
    }
  }

  // ------------------------------------------------------------------------
  takeHit(spec, dir, by) {
    if (!this.alive) return false;
    const g = this.game;
    const ready = ['circle', 'chase', 'idle', 'approach'].includes(this.state);
    const light = !spec.heavy && !spec.launch && !spec.finisher && !spec.black && !spec.spike;
    if (ready && light && by && this.cfg.blocks && Math.random() < this.cfg.blocks) {
      // facing the attacker? then the pipe takes the hit
      const f = _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      if (f.dot(dir) < -0.3) {
        g.fx.add.emit(this.chest(_v), 10, { speed: 6, color: [1.6, 2.2, 3], life: 0.25, size: 0.12, gravity: 4 });
        g.audio.tone({ freq: 1300, to: 900, type: 'square', dur: 0.08, gain: 0.08 });
        g.hud.flashText('BLOCKED', '#9fc3ff');
        by.vel.addScaledVector(dir, -4);
        this.yaw = Math.atan2(-dir.x, -dir.z);
        if (Math.random() < 0.5 && !this.token && g.requestToken(this, false)) { this.setState('attack'); this.targetsPlayer = true; this.perfectDodged = false; this.t = this.cfg.atkDur * 0.3; }
        return false;
      }
    }
    if (ready && light && this.cfg.evade && Math.random() < this.cfg.evade) {
      // symbiotes skitter out of the way
      const side = Math.random() < 0.5 ? 1 : -1;
      this.vel.set(-dir.z * side * 9 + dir.x * 4, 0, dir.x * side * 9 + dir.z * 4);
      g.fx.dark.emit(this.chest(_v), 8, { speed: 3, color: [0.02, 0.01, 0.03], life: 0.4, size: 0.15 });
      return false;
    }
    let dmg = spec.dmg;
    // committed attacks have hyper-armour against light hits: dodge, or use something heavy
    if (this.state === 'attack' && light && this.cfg.atkDur && this.t > this.cfg.atkDur * 0.25 && this.t < ACT[this.cfg.atk].hit * this.cfg.atkDur) {
      this.hp -= dmg * 0.6;
      this.flashT = 0.08;
      g.fx.add.emit(this.chest(_v), 6, { speed: 4, color: [3, 1.5, 0.5], life: 0.2, size: 0.1 });
      if (this.hp <= 0) { this.ko(dir, spec); }
      return true;
    }
    if (this.state === 'webbed') dmg *= 1.5;
    if (this.cfg.heavy && !spec.heavy && !this.armorBroken) dmg *= 0.5;
    this.hp -= dmg;
    this.flashT = 0.06;
    this.releaseToken();
    if (this.cfg.heavy) {
      this.armor += dmg;
      if (this.armor > 75 && !this.armorBroken) { this.armorBroken = 4; this.armor = 0; this.setState('stagger'); this.stun = 1.6; g.hud.flashText('GUARD BROKEN', '#ffb070'); }
    }
    if (this.hp <= 0 || spec.finisher) { this.ko(dir, spec); return true; }
    if (this.state === 'webbed') {
      if (spec.heavy) this.unweb(); else return true;
    }
    const kb = spec.kb || 2;
    if (spec.launch && this.canLaunch && !this.airborne) {
      this.setState('air'); this.vel.set(dir.x * 0.5, spec.launch, dir.z * 0.5); this.juggleT = 1.5; this.fallStart = this.pos.y;
    } else if (this.airborne || this.state === 'air') {
      if (spec.spike) { this.vel.set(dir.x * 3, -28, dir.z * 3); this.juggleT = 0; this.spiked = true; }
      else if (spec.knock) { this.vel.set(dir.x * kb, Math.max(this.vel.y, spec.up || 3), dir.z * kb); this.juggleT = 0; }
      else { this.vel.set(dir.x * 1.2, Math.max(this.vel.y, 2.8), dir.z * 1.2); this.juggleT = 1.0; }
      if (this.state !== 'air') this.setState('air');
    } else if (spec.knock && (!this.cfg.heavy || this.armorBroken)) {
      this.setState('air'); this.vel.set(dir.x * kb, spec.up || 3.5, dir.z * kb); this.fallStart = this.pos.y;
    } else if (!this.cfg.heavy || this.armorBroken) {
      this.setState('stagger'); this.stun = spec.stun || 0.4;
      this.vel.addScaledVector(dir, kb);
    } else {
      this.vel.addScaledVector(dir, kb * 0.25);
    }
    return true;
  }

  ko(dir, spec) {
    const g = this.game;
    this.releaseToken();
    const kb = (spec.kb || 6) * 1.3;
    this.vel.set(dir.x * kb, 5 + (spec.up || 0), dir.z * kb);
    this.hp = 0;
    this.state = 'ko'; this.t = 0;
    this.juggleT = 0;
    if (this.cocoon) { this.cocoon.visible = false; }
    g.onEnemyKO(this, spec);
  }

  onDeathLand() {
    const g = this.game;
    if (this.cfg.kind === 'symbiote' || this.cfg.kind === 'brute') {
      g.fx.dark.emit(this.chest(_v2), 50, { speed: 5, up: 3, color: [0.01, 0.0, 0.02], life: 1.2, size: 0.22, gravity: 6 });
      g.fx.add.emit(this.chest(_v2), 20, { speed: 4, color: [2, 0.2, 0.5], life: 0.8, size: 0.12, gravity: 3 });
      this.t = 3.2; // dissolve sooner
    }
  }

  webHit(n, by) {
    if (!this.alive) return;
    const g = this.game;
    this.webLevel += n;
    this.hp -= 2 * n;
    this.flashT = 0.06;
    if (this.hp <= 0) { this.ko(new THREE.Vector3(), { kb: 2 }); return; }
    const need = this.cfg.heavy ? 6 : 3;
    if (this.webLevel >= need && this.state !== 'webbed') {
      this.releaseToken();
      const wasAir = this.airborne;
      this.setState('webbed');
      this.webT = this.cfg.heavy ? 3 : 6;
      this.stuck = false;
      if (wasAir) {
        // stick to a nearby wall if there is one
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const hit = g.city.raycast(this.chest(_v2), _n.set(d[0], 0, d[1]), 2.5, {});
          if (hit && hit.box) { this.stuck = true; this.vel.set(0, 0, 0); this.pos.x = hit.point.x - d[0] * 0.5; this.pos.z = hit.point.z - d[1] * 0.5; break; }
        }
      }
      if (!this.cocoon) {
        this.cocoon = new THREE.Mesh(g.fx.cocoonGeo, g.fx.cocoonMat);
        this.char.root.add(this.cocoon);
      }
      this.cocoon.visible = true;
      g.audio.thwip(false);
      if (by) { by.combo++; by.comboT = 2.6; by.focus = Math.min(3, by.focus + 0.06); }
    } else if (this.state !== 'webbed' && !this.cfg.heavy && !this.airborne) {
      this.releaseToken();
      this.setState('stagger'); this.stun = 0.35;
    }
  }

  unweb() {
    this.webLevel = 0;
    this.stuck = false;
    if (this.cocoon) this.cocoon.visible = false;
    if (this.alive) this.setState(this.pos.y - this.game.city.groundAt(this.pos.x, this.pos.z, this.pos.y) > 0.5 ? 'air' : 'circle');
  }

  yankTo(by) {
    if (!this.alive || this.cfg.heavy) return;
    this.releaseToken();
    if (this.state === 'webbed') this.unweb();
    this.setState('yanked');
    this.vel.set(0, 4, 0);
  }

  grabSlam(by) {
    if (!this.alive) return;
    const g = this.game;
    this.releaseToken();
    if (this.state === 'webbed') this.unweb();
    // pulled in front of the player and driven into the ground
    const f = _v2.set(Math.sin(by.yaw), 0, Math.cos(by.yaw));
    const dest = by.pos.clone().addScaledVector(f, 2.2);
    const gy = g.city.groundAt(dest.x, dest.z, by.pos.y + 1);
    if (Math.abs(gy - by.pos.y) < 1.5) { this.pos.set(dest.x, gy, dest.z); }
    this.hp -= 22 * by.dmgMult * (this.cfg.heavy ? 0.6 : 1);
    this.flashT = 0.12;
    g.fx.ring(this.pos, 4, 0.4, [1.6, 0.5, 2.8]);
    g.fx.dark.emit(this.pos, 25, { speed: 6, color: [0.02, 0.01, 0.03], life: 0.6, size: 0.18, up: 3 });
    if (this.hp <= 0) { this.ko(f, { kb: 4, up: 2 }); return; }
    if (this.cfg.heavy && !this.armorBroken) { this.armor += 40; return; }
    this.setState('down');
  }

  stunned(t) {
    if (!this.alive) return;
    this.releaseToken();
    if (this.state === 'webbed') return;
    if (!this.airborne) { this.setState('stagger'); this.stun = t; }
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.releaseToken();
    this.char.dispose();
    const i = this.game.enemies.indexOf(this);
    if (i >= 0) this.game.enemies.splice(i, 1);
  }

  // ------------------------------------------------------------------------
  animate(dt) {
    const c = this.char, p = this.base.reset(), t = this.game.time + this.phase;
    const sym = this.cfg.kind === 'symbiote' || this.cfg.crawl;
    const mv = this.moving || 0;
    this.moving = 0;
    let k = 12;
    const stanceOrRun = () => {
      if (mv > 0.5) { this.phase += dt * (mv * 0.9 + 2); sym ? P.crawl(p, this.phase * 1.3, Math.min(1, mv / 5)) : P.run(p, this.phase, Math.min(1, mv / 6), 0); }
      else if (sym) P.crawl(p, t * 2, 0.15);
      else if (this.alerted) P.stance(p, t); else P.idle(p, t);
    };
    switch (this.state) {
      case 'idle': case 'chase': case 'circle': case 'approach': stanceOrRun(); break;
      case 'attack': {
        stanceOrRun();
        evalAction(this.tgt, p, ACT[this.cfg.atk], Math.min(1, this.t / this.cfg.atkDur));
        p.copy(this.tgt);
        k = 22;
        break;
      }
      case 'aim': case 'fire': stanceOrRun(); evalAction(this.tgt, p, ACT.aim, 0.5); p.copy(this.tgt); k = 16; break;
      case 'leapWind': P.crawl(p, 0, 0); evalAction(this.tgt, p, ACT.leap, Math.min(0.45, this.t)); p.copy(this.tgt); k = 18; break;
      case 'leapAir': evalAction(this.tgt, p, ACT.leap, 0.5 + Math.min(0.5, this.t)); p.copy(this.tgt); k = 18; break;
      case 'stagger': P.hit(p, Math.max(0.3, 1 - this.t / (this.stun || 0.4))); k = 18; break;
      case 'air': case 'yanked':
        P.fall(p, t * 3);
        if (this.state === 'air' && this.vel.y < -2 && this.juggleT <= 0) { p.set('pivot', -0.9, 0, 0); }
        k = 14; break;
      case 'ko': P.fall(p, t * 4); p.set('pivot', -this.spin, 0, 0); k = 30; break;
      case 'down': case 'dead': P.down(p); k = 10; break;
      case 'getup': P.idle(p, t); evalAction(this.tgt, p, ACT.getup, Math.min(1, this.t / 0.8)); p.copy(this.tgt); k = 16; break;
      case 'webbed': P.webbed(p, t); k = 10; break;
    }
    if (this.cfg.kind === 'brute') { p.add('spine', 0.25, 0, 0).add('head', -0.25, 0, 0); p.add('arL', 0, 0, 0.25).add('arR', 0, 0, -0.25); }
    c.drive(p, k, dt);
    c.root.position.copy(this.pos);
    c.root.rotation.y = this.yaw;
    if (c.acc) animateAccessories(c, dt, { t: this.game.time, speed: this.vel.length() });
  }
}

export { TYPES };

// ---------------------------------------------------------------------------
// Encounters: street crimes, rooftop gangs, symbiote outbreaks and hives.
// ---------------------------------------------------------------------------
export class Encounters {
  constructor(game) {
    this.game = game;
    this.events = [];
    this.spawnT = 2;
    this.idc = 0;
    for (const h of game.city.hives) {
      this.events.push({
        id: this.idc++, type: 'hive', hive: h, pos: new THREE.Vector3(h.pos.x, h.roof.y1, h.pos.z), label: 'Symbiote Hive',
        enemies: [], spawned: false, cleared: false, reinf: 10,
        comp: h.id % 2 ? ['crawler', 'crawler', 'crawler', 'brute'] : ['crawler', 'crawler', 'crawler', 'crawler'],
      });
    }
  }

  get active() { return this.events.filter((e) => !e.cleared); }

  createEvent() {
    const g = this.game, city = g.city, P = g.player.pos;
    const roll = Math.random();
    const type = roll < 0.4 ? 'gang' : roll < 0.7 ? 'roof' : 'outbreak';
    let pos = null;
    for (let a = 0; a < 60 && !pos; a++) {
      if (type === 'roof' || (type === 'outbreak' && Math.random() < 0.5)) {
        const t = city.tops[Math.floor(Math.random() * city.tops.length)];
        if (t.small || t.y < 18 || t.y > 120 || t.x1 - t.x0 < 18 || t.z1 - t.z0 < 18) continue;
        const p = new THREE.Vector3((t.x0 + t.x1) / 2, t.y, (t.z0 + t.z1) / 2);
        if (city.roofAt(p.x, p.z) > t.y + 0.5) continue;
        const d = Math.hypot(p.x - P.x, p.z - P.z);
        if (d < 110 || d > 480) continue;
        pos = p;
      } else {
        const i = Math.floor(Math.random() * (L.COLS + 1)), j = Math.floor(Math.random() * (L.ROWS + 1));
        const x = L.X0 + i * L.PX + L.AVE / 2, z = L.Z0 + j * L.PZ + L.ST + 10 + Math.random() * (L.BZ - 20);
        const p = new THREE.Vector3(x, 0, z);
        if (x > L.PARK_RECT.x0 - 5 && x < L.PARK_RECT.x1 + 5 && z > L.PARK_RECT.z0 && z < L.PARK_RECT.z1) continue;
        const d = Math.hypot(p.x - P.x, p.z - P.z);
        if (d < 110 || d > 480) continue;
        pos = p;
      }
      if (pos && this.events.some((e) => !e.cleared && e.pos.distanceTo(pos) < 80)) pos = null;
    }
    if (!pos) return;
    const lvl = g.level;
    let comp;
    if (type === 'outbreak') comp = ['crawler', 'crawler', 'crawler', ...(Math.random() < 0.35 + lvl * 0.05 ? ['brute'] : ['crawler'])];
    else {
      const n = 3 + Math.min(3, Math.floor(lvl / 2)) + Math.floor(Math.random() * 2);
      comp = [];
      for (let k = 0; k < n; k++) { const r = Math.random(); comp.push(r < 0.5 ? 'thug' : r < 0.75 ? 'pipe' : 'gunner'); }
      if (!comp.includes('gunner') && Math.random() < 0.6) comp[0] = 'gunner';
    }
    const labels = { gang: 'Street Crime', roof: 'Rooftop Gang', outbreak: 'Symbiote Outbreak' };
    this.events.push({ id: this.idc++, type, pos, label: labels[type], enemies: [], spawned: false, cleared: false, comp });
  }

  spawn(ev) {
    const g = this.game, city = g.city;
    ev.spawned = true;
    ev.enemies = [];
    ev.alerted = false;
    const list = ev.comp;
    for (let k = 0; k < list.length; k++) {
      let p = null;
      for (let a = 0; a < 40; a++) {
        const ang = (k / list.length) * Math.PI * 2 + Math.random() * 0.8 + a * 0.7;
        const rr = (ev.type === 'hive' ? 6.5 + Math.random() * 4 : 3 + Math.random() * 5) * (a > 20 ? 0.8 : 1);
        const x = ev.pos.x + Math.cos(ang) * rr, z = ev.pos.z + Math.sin(ang) * rr;
        const gy = city.groundAt(x, z, ev.pos.y + 1);
        if (Math.abs(gy - ev.pos.y) > 0.5) continue;
        const test = new THREE.Vector3(x, gy + 0.9, z);
        if (city.collide(test, 0.5, _n)) continue;
        p = new THREE.Vector3(x, gy, z);
        break;
      }
      if (!p) {
        if (ev.type === 'hive') continue; // no room on this roof; skip rather than spawn inside the hive
        p = ev.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
      }
      const e = new Enemy(g, list[k], p, ev);
      ev.enemies.push(e);
      g.enemies.push(e);
    }
  }

  despawn(ev) {
    for (const e of ev.enemies) e.remove();
    ev.enemies = [];
    ev.spawned = false;
  }

  // hivesOnly: during story missions only the hives keep spawning guards
  update(dt, hivesOnly = false) {
    const g = this.game, P = g.player.pos;
    this.spawnT -= dt;
    const crimes = this.events.filter((e) => e.type !== 'hive' && !e.cleared).length;
    if (!hivesOnly && crimes < 2 && this.spawnT <= 0) { this.createEvent(); this.spawnT = 5; }
    for (const ev of this.events) {
      if (ev.cleared || (hivesOnly && ev.type !== 'hive')) continue;
      if (ev.type === 'hive' && !ev.hive.active) { if (ev.spawned) this.despawn(ev); continue; }
      const d = Math.hypot(ev.pos.x - P.x, ev.pos.z - P.z);
      if (!ev.spawned && d < 125 && g.enemies.length < 22) this.spawn(ev);
      if (!ev.spawned) continue;
      const alive = ev.enemies.filter((e) => e.alive).length;
      if (ev.type === 'hive') {
        if (!ev.hive.alive) { ev.cleared = true; continue; }
        ev.reinf -= dt;
        if (ev.reinf <= 0 && d < 90 && alive < 2 && (ev.waves = (ev.waves || 0)) < 4) {
          ev.reinf = 16;
          ev.waves++;
          ev.comp = ['crawler', 'crawler'];
          const before = ev.enemies;
          this.spawn(ev);
          ev.enemies = before.filter((e) => !e.removed).concat(ev.enemies);
          for (const e of ev.enemies) e.alerted = true;
          g.fx.dark.emit(ev.hive.pos, 40, { speed: 8, up: 5, color: [0.02, 0.0, 0.03], life: 1, size: 0.3 });
          g.audio.screech();
        }
      } else if (alive === 0 && ev.enemies.length) {
        ev.cleared = true;
        g.onEventCleared(ev);
      }
      if (d > 330 && ev.type !== 'hive') this.despawn(ev);
      if (d > 260 && ev.type === 'hive') { this.despawn(ev); }
    }
    this.events = this.events.filter((e) => !e.cleared || e.type === 'hive');
  }
}
void clamp; void damp; void lerp;
