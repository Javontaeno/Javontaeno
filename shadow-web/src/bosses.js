import * as THREE from 'three';
import { Enemy } from './enemies.js';
import { CAST } from './cast.js';
import { P, ACT, evalAction, lookMaterial } from './character.js';
import { animateAccessories } from './accessories.js';
import { tendrilMaterial, TENDRIL_GEO } from './fx.js';
import { CU } from './city.js';
import { clamp, dampAngle, damp, GLSL_NOISE } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const M = (o) => ({ cd: 2.5, range: [0, 99], w: 1, ...o });

// Boss move sets. Types: melee (optional lunge), aoe, line, proj, spikes, summon, dash, dive.
export const BOSSES = {
  venom: { cast: 'venom', hp: 1500, speed: 7, keep: 2.8, radius: 0.85, xp: 600, moves: [
    M({ id: 'claw', type: 'melee', anim: 'slash', dur: 0.75, hit: 0.58, reach: 3.5, dmg: 13, range: [0, 4.2], cd: 1.1, w: 3 }),
    M({ id: 'pound', type: 'aoe', anim: 'smash', dur: 1.15, hit: 0.66, radius: 5, dmg: 17, range: [0, 5], cd: 5, tele: true }),
    M({ id: 'lunge', type: 'melee', lunge: 26, anim: 'leap', dur: 0.95, hit: 0.55, reach: 3.3, dmg: 16, range: [6, 18], cd: 3.2 }),
    M({ id: 'whip', type: 'line', fxk: 'tendril', anim: 'tendrilA', dur: 0.95, hit: 0.62, width: 1.3, dmg: 12, range: [4, 16], cd: 2.8 }),
    M({ id: 'call', type: 'summon', anim: 'surge', dur: 1.2, hit: 0.5, count: 2, minion: 'crawler', cd: 20, below: 0.75 }),
  ] },
  cat: { cast: 'cat', hp: 1050, speed: 8.6, keep: 2.4, evade: 0.35, xp: 450, moves: [
    M({ id: 'kicks', type: 'melee', anim: 'kick', dur: 0.62, hit: 0.38, reach: 2.9, dmg: 10, range: [0, 3.6], cd: 0.7, w: 3 }),
    M({ id: 'spin', type: 'aoe', anim: 'spin', dur: 0.75, hit: 0.5, radius: 3.2, dmg: 12, range: [0, 3.6], cd: 3 }),
    M({ id: 'whip', type: 'line', fxk: 'whip', anim: 'webShot', dur: 0.75, hit: 0.55, width: 1.0, dmg: 10, range: [4, 13], cd: 2.2 }),
    M({ id: 'pounce', type: 'melee', lunge: 24, anim: 'webStrike', dur: 0.9, hit: 0.5, reach: 3.0, dmg: 13, range: [5, 15], cd: 2.8 }),
    M({ id: 'flip', type: 'dash', away: true, anim: 'dodge', dur: 0.45, hit: 0.3, range: [0, 3], cd: 4 }),
  ] },
  wolverine: { cast: 'wolverine', hp: 1400, speed: 8.2, keep: 2.2, blocks: 0.35, regen: 9, xp: 600, moves: [
    M({ id: 'slash', type: 'melee', anim: 'slash', dur: 0.55, hit: 0.55, reach: 3.0, dmg: 10, range: [0, 3.7], cd: 0.55, w: 4 }),
    M({ id: 'upper', type: 'melee', anim: 'upper', dur: 0.8, hit: 0.36, reach: 2.9, dmg: 15, range: [0, 3.2], cd: 3 }),
    M({ id: 'lunge', type: 'melee', lunge: 28, anim: 'leap', dur: 0.85, hit: 0.5, reach: 3.3, dmg: 15, range: [5, 16], cd: 2.5 }),
    M({ id: 'frenzy', type: 'aoe', anim: 'spin', dur: 1.0, hit: 0.5, radius: 3.6, dmg: 16, range: [0, 4], cd: 6, below: 0.55 }),
  ] },
  electro: { cast: 'electro', hp: 1150, speed: 6, keep: 11, xp: 500, moves: [
    M({ id: 'bolt', type: 'line', fxk: 'lightning', anim: 'webShot', dur: 0.9, hit: 0.68, width: 1.0, dmg: 12, range: [3, 34], cd: 1.5, w: 3 }),
    M({ id: 'storm', type: 'aoe', fxk: 'storm', anim: 'surge', dur: 1.5, hit: 0.72, radius: 7, dmg: 16, range: [0, 7], cd: 5.5, tele: true }),
    M({ id: 'orbs', type: 'proj', pk: 'bolt', count: 3, spread: 0.25, speed: 24, anim: 'bomb', dur: 0.8, hit: 0.4, dmg: 8, range: [6, 30], cd: 4 }),
    M({ id: 'warp', type: 'dash', anim: 'dodge', dur: 0.45, hit: 0.3, range: [0, 6], cd: 3.5, far: true }),
  ] },
  symelectro: { cast: 'symelectro', hp: 1600, speed: 6.5, keep: 10, xp: 700, moves: [
    M({ id: 'bolt', type: 'line', fxk: 'lightning', anim: 'webShot', dur: 0.8, hit: 0.66, width: 1.1, dmg: 13, range: [3, 34], cd: 1.3, w: 3 }),
    M({ id: 'storm', type: 'aoe', fxk: 'storm', anim: 'surge', dur: 1.4, hit: 0.72, radius: 8, dmg: 18, range: [0, 8], cd: 5, tele: true }),
    M({ id: 'spikes', type: 'spikes', anim: 'tendrilC', dur: 1.2, hit: 0.75, radius: 3, dmg: 15, range: [0, 25], cd: 4 }),
    M({ id: 'call', type: 'summon', anim: 'surge', dur: 1.1, hit: 0.5, count: 2, minion: 'crawler', cd: 16, below: 0.7 }),
    M({ id: 'warp', type: 'dash', anim: 'dodge', dur: 0.45, hit: 0.3, range: [0, 6], cd: 3.2, far: true }),
  ] },
  symcat: { cast: 'symcat', hp: 1650, speed: 8.6, keep: 2.6, evade: 0.25, xp: 800, moves: [
    M({ id: 'kicks', type: 'melee', anim: 'kick', dur: 0.6, hit: 0.38, reach: 3.0, dmg: 11, range: [0, 3.6], cd: 0.7, w: 3 }),
    M({ id: 'lash', type: 'line', fxk: 'tendril', anim: 'tendrilA', dur: 0.85, hit: 0.6, width: 1.3, dmg: 12, range: [4, 15], cd: 2.4 }),
    M({ id: 'spikes', type: 'spikes', anim: 'tendrilC', dur: 1.15, hit: 0.75, radius: 3, dmg: 15, range: [0, 22], cd: 3.6 }),
    M({ id: 'pounce', type: 'melee', lunge: 25, anim: 'webStrike', dur: 0.9, hit: 0.5, reach: 3.0, dmg: 14, range: [5, 16], cd: 2.8 }),
    M({ id: 'call', type: 'summon', anim: 'surge', dur: 1.1, hit: 0.5, count: 3, minion: 'crawler', cd: 18, below: 0.7 }),
  ] },
  symwolv: { cast: 'symwolv', hp: 1000, speed: 8.4, keep: 2.2, blocks: 0.25, xp: 500, moves: [
    M({ id: 'slash', type: 'melee', anim: 'slash', dur: 0.55, hit: 0.55, reach: 3.0, dmg: 11, range: [0, 3.7], cd: 0.55, w: 4 }),
    M({ id: 'lunge', type: 'melee', lunge: 28, anim: 'leap', dur: 0.85, hit: 0.5, reach: 3.3, dmg: 16, range: [5, 16], cd: 2.4 }),
    M({ id: 'lash', type: 'line', fxk: 'tendril', anim: 'tendrilA', dur: 0.85, hit: 0.6, width: 1.2, dmg: 12, range: [4, 14], cd: 3 }),
  ] },
  // Rhino: armoured, barely flinches; bait the charge into a wall to stun him.
  rhino: { cast: 'rhino', hp: 1800, speed: 5.6, keep: 3.4, radius: 1.05, armorK: 260, xp: 650, moves: [
    M({ id: 'gore', type: 'melee', anim: 'upper', dur: 0.9, hit: 0.45, reach: 3.8, dmg: 16, range: [0, 4.4], cd: 1.4, w: 3 }),
    M({ id: 'stomp', type: 'aoe', anim: 'smash', dur: 1.25, hit: 0.7, radius: 6, dmg: 18, range: [0, 6], cd: 5.5, tele: true }),
    M({ id: 'charge', type: 'charge', anim: 'surge', dur: 1.0, hit: 0.85, speed: 32, chargeT: 1.6, dmg: 24, stunT: 3.4, range: [6, 40], cd: 3.5, w: 3 }),
    M({ id: 'hurl', type: 'proj', pk: 'rock', lob: true, count: 1, spread: 0, speed: 22, anim: 'smash', dur: 1.1, hit: 0.55, dmg: 16, range: [10, 40], cd: 5 }),
  ] },
  symrhino: { cast: 'symrhino', hp: 2000, speed: 6.4, keep: 3.2, radius: 1.05, armorK: 260, xp: 850, moves: [
    M({ id: 'gore', type: 'melee', anim: 'upper', dur: 0.85, hit: 0.45, reach: 3.8, dmg: 17, range: [0, 4.4], cd: 1.3, w: 3 }),
    M({ id: 'charge', type: 'charge', anim: 'surge', dur: 0.9, hit: 0.85, speed: 36, chargeT: 1.7, dmg: 26, stunT: 3.0, range: [6, 40], cd: 3, w: 3 }),
    M({ id: 'spikes', type: 'spikes', anim: 'tendrilC', dur: 1.15, hit: 0.75, radius: 3.2, dmg: 16, range: [0, 26], cd: 3.8 }),
    M({ id: 'lash', type: 'line', fxk: 'tendril', anim: 'tendrilA', dur: 0.9, hit: 0.62, width: 1.4, dmg: 13, range: [4, 16], cd: 3 }),
    M({ id: 'call', type: 'summon', anim: 'surge', dur: 1.2, hit: 0.5, count: 2, minion: 'crawler', cd: 18, below: 0.7 }),
  ] },
  // Shocker: keeps his distance and fills the street with vibration blasts.
  shocker: { cast: 'shocker', hp: 1250, speed: 6.4, keep: 9, xp: 550, moves: [
    M({ id: 'blast', type: 'line', fxk: 'shock', anim: 'webShot', dur: 0.85, hit: 0.62, width: 1.4, dmg: 13, range: [3, 30], cd: 1.6, w: 3 }),
    M({ id: 'quake', type: 'aoe', fxk: 'quake', anim: 'smash', dur: 1.3, hit: 0.7, radius: 7, dmg: 17, range: [0, 7], cd: 5.5, tele: true }),
    M({ id: 'pulses', type: 'proj', pk: 'pulse', count: 3, spread: 0.22, speed: 20, anim: 'bomb', dur: 0.8, hit: 0.45, dmg: 9, range: [5, 30], cd: 3.5 }),
    M({ id: 'hop', type: 'dash', away: true, anim: 'dodge', dur: 0.5, hit: 0.3, range: [0, 4], cd: 3.5 }),
  ] },
  // Deadpool (only if you never caught him on the rooftops): fast, cheap and chatty.
  deadpool: { cast: 'deadpool', hp: 1100, speed: 8.6, keep: 2.4, evade: 0.3, xp: 500, moves: [
    M({ id: 'slash', type: 'melee', anim: 'slash', dur: 0.55, hit: 0.55, reach: 3.0, dmg: 10, range: [0, 3.6], cd: 0.6, w: 4 }),
    M({ id: 'spin', type: 'aoe', anim: 'spin', dur: 0.75, hit: 0.5, radius: 3.4, dmg: 13, range: [0, 3.8], cd: 3.5 }),
    M({ id: 'guns', type: 'proj', pk: 'bullet', count: 4, spread: 0.07, speed: 60, anim: 'aim', dur: 0.8, hit: 0.5, dmg: 5, range: [5, 30], cd: 2.6 }),
    M({ id: 'grenade', type: 'spikes', fxk: 'boom', anim: 'bomb', dur: 1.2, hit: 0.8, radius: 3.4, dmg: 15, range: [4, 22], cd: 5 }),
    M({ id: 'poof', type: 'dash', anim: 'dodge', dur: 0.45, hit: 0.3, range: [0, 5], cd: 4, far: true, poof: true }),
  ] },
  vulture: { cast: 'vulture', hp: 1150, speed: 9, fly: true, xp: 550, moves: [
    M({ id: 'dive', type: 'dive', anim: 'webStrike', dur: 1.7, hit: 0.55, dmg: 15, cd: 3.2, w: 2 }),
    M({ id: 'feathers', type: 'proj', pk: 'feather', count: 5, spread: 0.32, speed: 30, anim: 'bomb', dur: 0.9, hit: 0.45, dmg: 6, cd: 2.4, range: [0, 45] }),
  ] },
};

// ---------------------------------------------------------------------------
class Projectiles {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.geos = {
      feather: new THREE.BoxGeometry(0.08, 0.02, 0.7),
      bolt: new THREE.SphereGeometry(0.28, 10, 8),
      goo: new THREE.SphereGeometry(0.45, 12, 10),
      rock: new THREE.DodecahedronGeometry(0.9, 0),
      pulse: new THREE.SphereGeometry(0.4, 14, 10),
      bullet: new THREE.BoxGeometry(0.04, 0.04, 0.5),
    };
    this.mats = {
      feather: new THREE.MeshStandardMaterial({ color: 0x2c6a36, roughness: 0.7 }),
      bolt: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.4, 1.4) }),
      goo: new THREE.MeshPhysicalMaterial({ color: 0x050407, roughness: 0.1, clearcoat: 1, emissive: 0x200008 }),
      rock: new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 0.95, flatShading: true }),
      pulse: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 0.7), transparent: true, opacity: 0.55, depthWrite: false }),
      bullet: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4, 2) }),
    };
  }
  fire(kind, from, vel, dmg) {
    const m = new THREE.Mesh(this.geos[kind], this.mats[kind]);
    m.position.copy(from);
    m.lookAt(_v.copy(from).add(vel));
    this.g.scene.add(m);
    this.list.push({ m, vel: vel.clone(), life: 3, dmg, kind });
  }
  update(dt) {
    const pl = this.g.player;
    for (const p of this.list) {
      p.life -= dt;
      p.m.position.addScaledVector(p.vel, dt);
      if (p.kind === 'bolt') this.g.fx.add.emit(p.m.position, 1, { speed: 1, color: [4, 3.5, 1], life: 0.2, size: 0.25, gravity: 0 });
      if (p.kind === 'goo' || p.kind === 'rock') { p.vel.y -= 14 * dt; }
      if (p.kind === 'rock') { p.m.rotation.x += dt * 5; p.m.rotation.z += dt * 3; }
      if (p.kind === 'pulse') { const k = 1 + Math.sin(p.life * 30) * 0.15; p.m.scale.setScalar(k); }
      const hit = pl.chestPos(_v2).distanceTo(p.m.position) < (p.kind === 'goo' || p.kind === 'rock' ? 1.5 : 1.0);
      if (hit) { pl.hurt(p.dmg, p.m.position); p.life = 0; }
      if (p.m.position.y < this.g.city.groundAt(p.m.position.x, p.m.position.z, p.m.position.y + 1)) {
        p.life = 0;
        if (p.kind === 'rock') { this.g.fx.add.emit(p.m.position, 18, { speed: 7, up: 3, color: [0.5, 0.45, 0.4], life: 0.6, size: 0.3, gravity: 14 }); this.g.cam.shake(0.2); if (pl.pos.distanceTo(p.m.position) < 3.5) pl.hurt(p.dmg, p.m.position); }
        if (p.kind === 'goo') { this.g.fx.dark.emit(p.m.position, 20, { speed: 6, up: 3, color: [0.02, 0.01, 0.02], life: 0.6, size: 0.25 }); if (pl.pos.distanceTo(p.m.position) < 3) pl.hurt(p.dmg, p.m.position); }
      }
    }
    for (const p of this.list) if (p.life <= 0) p.m.removeFromParent();
    this.list = this.list.filter((p) => p.life > 0);
  }
  clear() { for (const p of this.list) p.m.removeFromParent(); this.list = []; }
}
let PROJ = null;
export function projectiles(game) { return PROJ || (PROJ = new Projectiles(game)); }

// ---------------------------------------------------------------------------
export class Boss extends Enemy {
  constructor(game, id, pos, opts = {}) {
    const def = BOSSES[id];
    const c = CAST[def.cast];
    const sym = !!(c.look && c.look.symbiote);
    super(game, 'brute', pos, null, {
      look: { ...c.look, build: c.build, seed: 900 }, lookExact: true,
      hp: def.hp,
      cfg: { kind: sym ? 'brute' : 'thug', heavy: true, radius: def.radius || 0.6, xp: def.xp || 400, ranged: false, blocks: 0, evade: 0, leap: false },
    });
    this.def = def; this.isBoss = true; this.bossId = id;
    this.name = opts.name || c.name;
    this.endAt = opts.endAt || 0;
    this.defeated = false;
    this.alerted = true;
    this.cds = {};
    for (const m of def.moves) this.cds[m.id] = 1 + Math.random() * 1.5;
    this.move = null;
    this.lastHurt = 99;
    this.flying = !!def.fly;
    this.grounded = 0;
    this.airHits = 0;
    this.orbit = Math.random() * 6.28;
    this.minions = [];
    this.setState(this.flying ? 'fly' : 'idle');
  }

  get canLaunch() { return false; }
  get airborne() { return this.flying && !this.grounded; }

  speedMul() { return this.def.id === 'wolverine' || this.bossId === 'wolverine' ? (this.hp < this.maxHp * 0.5 ? 1.3 : 1) : 1; }

  update(dt) {
    const g = this.game, pl = g.player;
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.char.setFlash(this.flashT > 0 ? 0.18 : 0);
    this.armorBroken = Math.max(0, this.armorBroken - dt);
    this.armor = Math.max(0, this.armor - dt * 25);
    this.dazed = Math.max(0, (this.dazed || 0) - dt);
    if (this.dazed > 0 && Math.random() < 0.25) { const a = this.t * 6; g.fx.add.emit(_v2.set(this.pos.x + Math.cos(a) * 0.5, this.pos.y + 2.4 * this.scale, this.pos.z + Math.sin(a) * 0.5), 1, { speed: 0.3, color: [3, 2.6, 0.8], life: 0.4, size: 0.12, gravity: 0 }); }
    this.lastHurt += dt;
    for (const k in this.cds) this.cds[k] -= dt;
    if (this.def.regen && this.lastHurt > 2.5 && !this.defeated && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + this.def.regen * dt);

    const toP = _v.copy(pl.pos).sub(this.pos);
    const dy = toP.y; toP.y = 0;
    const dH = toP.length();
    const faceP = (k = 10) => { if (dH > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(toP.x, toP.z), k, dt); };

    const frozen = this.defeated || (g.story && g.story.cine) || this.frozen || pl.state === 'dead';
    if (frozen) {
      this.targetsPlayer = false; this.threatT = -1;
      if (this.flying && !this.grounded) this.hover(dt, pl, true);
      else this.physics(dt);
      this.animate(dt);
      return;
    }
    if (this.flying && !this.grounded) { this.flyAI(dt, pl, toP, dH); this.animate(dt); return; }
    // knocked off a rooftop (or left behind on one)? climb back to the fight
    if (!this.flying && this.state !== 'air' && Math.abs(dy) > 8 && pl.state === 'ground') this.apart = (this.apart || 0) + dt; else this.apart = 0;
    if (this.apart > 3) this.rejoin(pl);

    switch (this.state) {
      case 'idle': case 'circle': case 'chase': {
        faceP();
        const keep = this.def.keep || 2.5;
        const dir = _v2.copy(toP).normalize();
        if (dH > keep + 1) this.walk(dir, this.def.speed * this.speedMul(), dt);
        else if (dH < keep - 1.2) this.walk(dir.negate(), this.def.speed * 0.6, dt);
        else this.walk(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafe), this.def.speed * 0.4, dt);
        this.strafeT -= dt; if (this.strafeT < 0) { this.strafe *= -1; this.strafeT = 1.5 + Math.random() * 2; }
        const m = this.pickMove(dH, dy);
        if (m) this.startMove(m);
        if (this.grounded > 0) { this.grounded -= dt; if (this.grounded <= 0) this.takeOff(); }
        break;
      }
      case 'move': this.runMove(dt, toP, dH, dy, faceP); break;
      case 'stagger': if (this.t > (this.stun || 0.4)) this.setState('idle'); break;
      case 'air': break;
      case 'down':
        if (this.t > (this.grounded > 0 ? this.grounded : 1.0)) { if (this.grounded > 0) { this.grounded = 0; this.takeOff(); } else this.setState('getup'); }
        break;
      case 'getup': if (this.t > 0.7) this.setState('idle'); break;
      case 'webbed': this.webT -= dt; if (this.webT <= 0) this.unweb(); break;
      case 'dead': if (this.t > 5) this.remove(); break;
      default: this.setState('idle');
    }
    this.physics(dt);
    this.animate(dt);
  }

  rejoin(pl) {
    const g = this.game;
    this.apart = 0;
    for (let a = 0; a < 16; a++) {
      const ang = a * 0.8, x = pl.pos.x + Math.cos(ang) * 7, z = pl.pos.z + Math.sin(ang) * 7;
      const gy = g.city.groundAt(x, z, pl.pos.y + 1);
      if (Math.abs(gy - pl.pos.y) > 0.6 || g.city.pointInBox(_v2.set(x, gy + 1, z), 0.4)) continue;
      g.fx.dark.emit(this.chest(_v2), 30, { speed: 5, up: 3, color: [0.03, 0.03, 0.04], life: 0.7, size: 0.35 });
      this.pos.set(x, gy, z); this.vel.set(0, 0, 0); this.setState('idle');
      g.fx.dark.emit(this.chest(_v2), 30, { speed: 5, up: 3, color: [0.03, 0.03, 0.04], life: 0.7, size: 0.35 });
      g.audio.land(true);
      return;
    }
  }

  pickMove(dH, dy) {
    const opts = this.def.moves.filter((m) => this.cds[m.id] <= 0 && dH >= m.range[0] && dH <= m.range[1] && Math.abs(dy) < 6 && (!m.below || this.hp < this.maxHp * m.below));
    if (!opts.length) return null;
    let sum = 0; for (const m of opts) sum += m.w;
    let r = Math.random() * sum;
    for (const m of opts) { r -= m.w; if (r <= 0) return m; }
    return opts[0];
  }

  startMove(m) {
    const g = this.game, pl = g.player;
    this.move = m;
    this.setState('move');
    this.didHit = false;
    this.perfectDodged = false;
    this.aimPt = pl.chestPos(new THREE.Vector3());
    this.spikePt = pl.pos.clone();
    if (m.type === 'spikes') this.tele = g.fx.telegraph(this.spikePt, m.radius, m.dur * m.hit);
    if (m.tele) this.tele = g.fx.telegraph(this.pos.clone(), m.radius, m.dur * m.hit);
    if (m.type === 'summon') g.audio.screech();
  }

  // Rhino's charge: wind up, lock a direction, then run until he hits you, a wall, a ledge or runs out of steam.
  runCharge(dt, toP, dH, faceP) {
    const g = this.game, pl = g.player, m = this.move, hitT = m.dur * m.hit;
    if (this.t < hitT) {
      this.targetsPlayer = true;
      this.threatT = hitT - this.t;
      if (this.t < hitT - 0.35) faceP(8);
      else if (!this.chargeDir) {
        this.chargeDir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        const a = this.pos.clone().setY(this.pos.y + 0.2);
        g.fx.line(a, a.clone().addScaledVector(this.chargeDir, 26), 0xff3030, 0.4, 0.12);
        g.audio.screech();
      }
      return;
    }
    if (!this.chargeDir) this.chargeDir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.threatT = -1;
    const run = this.t - hitT;
    const sp = m.speed * Math.min(1, run * 4) * (run > m.chargeT - 0.3 ? Math.max(0, (m.chargeT - run) / 0.3) : 1);
    const d = this.chargeDir;
    const nx = this.pos.x + d.x * sp * dt, nz = this.pos.z + d.z * sp * dt;
    this.moving = sp;
    this.charging = true;
    if (Math.random() < 0.5) g.fx.add.emit(this.pos, 2, { speed: 3, up: 1, color: [0.45, 0.42, 0.38], life: 0.5, size: 0.35, gravity: 2 });
    // trample anything in the way
    for (const e of g.enemies) {
      if (e === this || !e.alive || e.isBoss || e.trampled) continue;
      if (e.pos.distanceTo(this.pos) < 2.4) { e.trampled = true; e.takeHit({ dmg: 30, kb: 14, knock: true, up: 6, heavy: true }, d, null); }
    }
    if (!this.didHit && Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) < 2.2 && Math.abs(pl.pos.y - this.pos.y) < 2.5) {
      this.didHit = true;
      if (!this.perfectDodged && pl.hurt(m.dmg, this.pos)) { pl.vel.addScaledVector(d, 14); pl.vel.y += 5; g.cam.shake(0.6); g.rumble(1, 0.8, 350); }
    }
    const end = () => { this.charging = false; this.chargeDir = null; this.cds[m.id] = m.cd; this.move = null; this.threatT = -1; this.targetsPlayer = false; for (const e of g.enemies) e.trampled = false; };
    const test = _v3.set(nx + d.x * 0.6, this.pos.y + 1.2 * this.scale, nz + d.z * 0.6);
    if (g.city.collide(test, this.radius, _v2) && Math.abs(_v2.y) < 0.4) {
      // slammed into a wall: dazed and wide open
      g.fx.ring(this.pos, 7, 0.5); g.fx.add.emit(test, 40, { speed: 10, up: 4, color: [0.55, 0.5, 0.45], life: 0.9, size: 0.35, gravity: 14 });
      g.audio.boom(); g.cam.shake(0.8); g.rumble(0.9, 0.9, 400);
      end();
      this.setState('stagger'); this.stun = m.stunT; this.armorBroken = m.stunT; this.dazed = m.stunT;
      g.hud.flashText(`${this.name.toUpperCase()} STUNNED`, '#ffd36a');
      return;
    }
    const gy = g.city.groundAt(nx, nz, this.pos.y + 1);
    if (Math.abs(gy - this.pos.y) > 1.2 || run >= m.chargeT) { end(); this.setState('idle'); return; }
    this.pos.x = nx; this.pos.z = nz; this.pos.y = gy;
    this.yaw = Math.atan2(d.x, d.z);
  }

  runMove(dt, toP, dH, dy, faceP) {
    const g = this.game, pl = g.player, m = this.move;
    if (m.type === 'charge') return this.runCharge(dt, toP, dH, faceP);
    const sm = this.speedMul();
    const T = m.dur / sm, hitT = m.hit * T;
    this.targetsPlayer = m.type !== 'summon' && m.type !== 'dash';
    this.threatT = this.t < hitT ? hitT - this.t : -1;
    if (this.t < hitT - 0.12) { faceP(14); if (m.type === 'line') this.aimPt = pl.chestPos(this.aimPt); }
    if (m.lunge && this.t > hitT * 0.35 && this.t < hitT) {
      const d = _v2.copy(toP).normalize();
      if (dH > 1.8) { this.pos.addScaledVector(d, Math.min(m.lunge, dH / Math.max(0.05, hitT - this.t)) * dt); }
    }
    if (this.t >= hitT && !this.didHit) { this.didHit = true; this.resolve(m, dH, dy, toP); }
    if (this.t >= T) {
      this.cds[m.id] = m.cd;
      this.threatT = -1; this.targetsPlayer = false;
      this.move = null;
      if (this.perfectDodged) { this.setState('stagger'); this.stun = 1.3; } else this.setState('idle');
    }
  }

  resolve(m, dH, dy, toP) {
    const g = this.game, pl = g.player;
    const dodged = this.perfectDodged;
    const chest = this.chest(_v3);
    switch (m.type) {
      case 'melee': {
        const f = _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        const front = dH < 0.8 || toP.clone().normalize().dot(f) > 0.2;
        if (!dodged && dH < m.reach && front && Math.abs(dy) < 2.5 && pl.hurt(m.dmg, this.pos)) g.fx.hitSpark(pl.chestPos(_v2), true, false);
        else g.audio.whoosh(true);
        break;
      }
      case 'aoe': {
        if (m.fxk === 'quake') { for (let i = 0; i < 3; i++) g.fx.ring(this.pos, m.radius * (0.5 + i * 0.35), 0.4 + i * 0.12, [2.4, 1.8, 0.6]); g.audio.boom(); }
        else if (m.fxk === 'storm') { for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28; g.fx.lightning(chest, _v2.set(this.pos.x + Math.cos(a) * m.radius, this.pos.y + 0.3, this.pos.z + Math.sin(a) * m.radius), 0.3); } g.audio.boom(); }
        else { g.fx.ring(this.pos, m.radius + 2, 0.45, this.def.cast === 'venom' ? [2, 0.3, 0.6] : undefined); g.fx.dark.emit(this.pos, 25, { speed: 8, up: 3, color: [0.03, 0.02, 0.02], life: 0.6, size: 0.25 }); g.audio.land(true); }
        g.cam.shake(dH < 12 ? 0.35 : 0.1);
        if (!dodged && dH < m.radius && Math.abs(dy) < 3) pl.hurt(m.dmg, this.pos);
        break;
      }
      case 'line': {
        const a = chest.clone(), b = this.aimPt.clone();
        const dir = _v2.copy(b).sub(a); const len = Math.max(1, dir.length()); dir.divideScalar(len);
        b.copy(a).addScaledVector(dir, Math.max(len, 14));
        if (m.fxk === 'lightning') { g.fx.lightning(a, b, 0.18); g.audio.gun(dH); }
        else if (m.fxk === 'tendril') { g.fx.tendril(a, b, 0.3); g.audio.thwip(true); }
        else if (m.fxk === 'shock') {
          // vibration blast: rings rippling down the line
          for (let i = 1; i < 8; i++) { const q = a.clone().lerp(b, i / 8); g.fx.ring(q.setY(q.y - 1.2), 1.4 + i * 0.12, 0.3, [2.4, 1.8, 0.6]); }
          g.fx.line(a, b, 0xffd27a, 0.15, 0.08); g.audio.boom(); g.cam.shake(0.15);
        }
        else { g.fx.line(a, b, 0x111111, 0.25, 0.02); g.audio.whoosh(false); }
        // distance from the player's chest to the attack segment
        const pc = pl.chestPos(new THREE.Vector3());
        const t = clamp(_v.copy(pc).sub(a).dot(dir), 0, Math.max(len, 14));
        const closest = a.clone().addScaledVector(dir, t);
        if (!dodged && closest.distanceTo(pc) < m.width) pl.hurt(m.dmg, this.pos);
        break;
      }
      case 'proj': {
        const P2 = projectiles(g);
        const from = this.char.handWorld('R', new THREE.Vector3());
        if (m.lob) {
          // arc the throw so it lands where the player is standing
          const v = pl.pos.clone().sub(from);
          const flat = Math.hypot(v.x, v.z), T = Math.max(0.7, flat / m.speed);
          P2.fire(m.pk, from.clone().setY(from.y + 0.6), new THREE.Vector3(v.x / T, v.y / T + 7 * T, v.z / T), dodged ? 0 : m.dmg);
          g.audio.whoosh(true);
          break;
        }
        for (let i = 0; i < m.count; i++) {
          const target = pl.chestPos(new THREE.Vector3()).addScaledVector(pl.vel, 0.3);
          const d = target.sub(from).normalize();
          const sp = (i - (m.count - 1) / 2) * m.spread;
          d.applyAxisAngle(new THREE.Vector3(0, 1, 0), sp);
          P2.fire(m.pk, from, d.multiplyScalar(m.speed), dodged ? 0 : m.dmg);
        }
        g.audio.whoosh(true);
        break;
      }
      case 'spikes': {
        const p = this.spikePt;
        if (m.fxk === 'boom') {
          g.fx.add.emit(p.clone().setY(p.y + 0.5), 60, { speed: 10, up: 4, color: [4, 2, 0.6], color2: [2, 0.6, 0.2], life: 0.5, size: 0.3 });
          g.fx.dark.emit(p, 30, { speed: 6, up: 5, color: [0.08, 0.07, 0.06], life: 1, size: 0.5, gravity: -1 });
          g.fx.ring(p, m.radius + 2, 0.4, [3, 1.6, 0.4]); g.audio.boom(); g.cam.shake(0.3);
          if (!dodged && pl.pos.distanceTo(p) < m.radius) pl.hurt(m.dmg, p);
          break;
        }
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * 6.28;
          g.fx.tendril(_v2.set(p.x + Math.cos(a) * 0.5, p.y - 0.3, p.z + Math.sin(a) * 0.5), new THREE.Vector3(p.x + Math.cos(a) * 1.2, p.y + 2.5 + Math.random(), p.z + Math.sin(a) * 1.2), 0.35);
        }
        g.fx.dark.emit(p, 25, { speed: 7, up: 4, color: [0.02, 0.0, 0.03], life: 0.6, size: 0.25 });
        g.audio.hive();
        if (!dodged && pl.pos.distanceTo(p) < m.radius) pl.hurt(m.dmg, p);
        break;
      }
      case 'summon': {
        for (let i = 0; i < m.count; i++) {
          const a = Math.random() * 6.28;
          const p = this.pos.clone().add(new THREE.Vector3(Math.cos(a) * 4, 0, Math.sin(a) * 4));
          p.y = g.city.groundAt(p.x, p.z, this.pos.y + 1);
          if (Math.abs(p.y - this.pos.y) > 1) p.copy(this.pos);
          const e = new Enemy(g, m.minion, p, { alerted: true });
          e.alerted = true;
          g.enemies.push(e);
          this.minions.push(e);
          if (g.story) g.story.adopt(e);
          g.fx.dark.emit(p, 25, { speed: 6, up: 4, color: [0.02, 0.0, 0.03], life: 0.8, size: 0.3 });
        }
        break;
      }
      case 'dash': {
        const away = m.away ? 1 : 0;
        let dest;
        if (m.far) { const a = Math.random() * 6.28; dest = g.player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 11, 0, Math.sin(a) * 11)); }
        else { const d = _v2.copy(this.pos).sub(g.player.pos).setY(0).normalize(); dest = this.pos.clone().addScaledVector(d, 6 * (away || 1)); }
        dest.y = g.city.groundAt(dest.x, dest.z, this.pos.y + 1);
        if (Math.abs(dest.y - this.pos.y) < 1.5 && !g.city.pointInBox(_v2.copy(dest).setY(dest.y + 0.9), 0.2)) {
          if (m.poof) { g.fx.dark.emit(this.chest(new THREE.Vector3()), 24, { speed: 4, up: 1.5, color: [0.22, 0.03, 0.03], life: 0.9, size: 0.45, gravity: -1 }); g.audio.tone({ freq: 180, to: 90, type: 'sawtooth', dur: 0.14, gain: 0.08 }); }
          else if (m.far) g.fx.lightning(this.chest(new THREE.Vector3()), dest.clone().setY(dest.y + 1.2), 0.2);
          this.pos.copy(dest);
          if (m.poof) g.fx.dark.emit(this.chest(new THREE.Vector3()), 24, { speed: 4, up: 1.5, color: [0.22, 0.03, 0.03], life: 0.9, size: 0.45, gravity: -1 });
        }
        break;
      }
    }
  }

  // --- flying (Vulture) ------------------------------------------------------
  hover(dt, pl, still) {
    const want = still ? this.pos.clone() : null;
    void want;
    this.vel.multiplyScalar(Math.exp(-3 * dt));
    this.pos.addScaledVector(this.vel, dt);
  }

  flyAI(dt, pl, toP, dH) {
    const g = this.game;
    this.state = this.state === 'move' ? 'move' : 'fly';
    const center = pl.pos;
    if (this.state === 'fly') {
      this.orbit += dt * 0.55;
      const r = 15;
      const gy = g.city.groundAt(center.x, center.z, center.y + 2);
      const target = _v2.set(center.x + Math.cos(this.orbit) * r, Math.max(center.y + 8, gy + 8), center.z + Math.sin(this.orbit) * r);
      const to = target.sub(this.pos);
      this.vel.lerp(to.multiplyScalar(1.4), damp(2, dt));
      this.pos.addScaledVector(this.vel, dt);
      this.yaw = dampAngle(this.yaw, Math.atan2(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z), 6, dt);
      const m = this.pickMove(dH, 0);
      if (m) { this.startMove(m); this.diveFrom = this.pos.clone(); }
    } else {
      const m = this.move, T = m.dur, hitT = m.hit * T;
      this.targetsPlayer = true;
      this.threatT = this.t < hitT ? hitT - this.t : -1;
      if (m.type === 'dive') {
        if (this.t < hitT * 0.6) { this.vel.multiplyScalar(Math.exp(-6 * dt)); this.pos.addScaledVector(this.vel, dt); this.aimPt = pl.chestPos(new THREE.Vector3()); if (!this.screeched) { this.screeched = true; g.audio.screech(); } }
        else if (this.t < hitT + 0.35) {
          const to = _v2.copy(this.aimPt).sub(this.pos);
          const d = to.length();
          this.vel.copy(to.normalize().multiplyScalar(Math.min(38, d / dt)));
          this.pos.addScaledVector(this.vel, dt);
          if (!this.didHit && this.pos.distanceTo(pl.chestPos(_v3)) < 2.4) { this.didHit = true; if (!this.perfectDodged) pl.hurt(m.dmg, this.pos); }
        } else { this.vel.y += 30 * dt; this.pos.addScaledVector(this.vel, dt); }
        this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 10, dt);
      } else {
        this.vel.multiplyScalar(Math.exp(-4 * dt)); this.pos.addScaledVector(this.vel, dt);
        this.yaw = dampAngle(this.yaw, Math.atan2(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z), 10, dt);
        if (this.t >= hitT && !this.didHit) { this.didHit = true; this.resolve(m, dH, 0, toP); }
      }
      if (this.t >= T) { this.cds[m.id] = m.cd; this.move = null; this.screeched = false; this.threatT = -1; this.targetsPlayer = false; this.state = 'fly'; this.t = 0; if (this.perfectDodged) this.groundMe(2.5); }
    }
    // keep out of buildings
    const c = _v3.copy(this.pos); c.y += 1;
    if (g.city.collide(c, 1.0, _v2)) { this.pos.copy(c); this.pos.y -= 1; this.vel.multiplyScalar(0.3); }
    const gy = g.city.groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
    if (this.pos.y < gy + 1.5) this.pos.y = gy + 1.5;
  }

  groundMe(t) {
    // knocked out of the sky: drop, then lie stunned and vulnerable
    this.grounded = t;
    this.move = null; this.threatT = -1; this.targetsPlayer = false;
    this.setState('air');
    this.vel.set(0, -2, 0);
    this.game.hud.flashText('VULTURE GROUNDED', '#9ff29f');
    this.game.audio.land(true);
  }

  takeOff() {
    this.grounded = 0; this.airHits = 0; this.webLevel = 0;
    this.setState('fly');
    this.vel.set(0, 14, 0);
  }

  webHit(n, by) {
    if (this.defeated || !this.alive) return;
    if (this.flying && !this.grounded) {
      this.webLevel += n;
      this.flashT = 0.06;
      if (this.webLevel >= 3) this.groundMe(4);
      return;
    }
    super.webHit(n, by);
  }

  yankTo() { if (this.flying && !this.grounded) this.groundMe(3.5); }
  grabSlam(by) { if (this.flying && !this.grounded) this.groundMe(3.5); else this.takeHit({ dmg: 22, heavy: true, black: true }, _v.copy(this.pos).sub(by.pos).setY(0).normalize(), by); }
  stunned(t) { if (this.flying && !this.grounded) return; if (!this.defeated) { this.setState('stagger'); this.stun = Math.min(t, 0.8); } }

  takeHit(spec, dir, by) {
    if (this.defeated || !this.alive || this.invuln) return false;
    const g = this.game;
    const ready = this.state === 'idle';
    const light = !spec.heavy && !spec.black && !spec.finisher;
    if (ready && light && this.def.evade && Math.random() < this.def.evade) {
      const side = Math.random() < 0.5 ? 1 : -1;
      this.vel.set(-dir.z * side * 10 + dir.x * 5, 0, dir.x * side * 10 + dir.z * 5);
      g.fx.add.emit(this.chest(_v2), 6, { speed: 3, color: [1.5, 1.5, 1.6], life: 0.3, size: 0.12 });
      return false;
    }
    if (ready && light && by && this.def.blocks && Math.random() < this.def.blocks) {
      const f = _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      if (f.dot(dir) < -0.2) {
        g.fx.add.emit(this.chest(_v3), 10, { speed: 6, color: [3, 2.6, 1.6], life: 0.25, size: 0.12, gravity: 4 });
        g.hud.flashText('BLOCKED', '#ffd27a');
        by.vel.addScaledVector(dir, -5);
        return false;
      }
    }
    let dmg = spec.finisher ? 140 : spec.dmg;
    if (spec.ally) dmg *= 0.5;
    if (this.flying && !this.grounded) { dmg *= 0.75; this.airHits++; if (this.airHits >= 5) this.groundMe(3.5); }
    if (this.grounded) dmg *= 1.25;
    if (this.dazed > 0) dmg *= 1.4;
    this.hp -= dmg;
    this.flashT = 0.06;
    this.lastHurt = 0;
    this.armor += dmg;
    if (this.armor > (this.def.armorK || 140) && !this.armorBroken && this.state !== 'move') { this.armorBroken = 3; this.armor = 0; this.setState('stagger'); this.stun = 1.4; g.hud.flashText('STAGGERED', '#ffb070'); }
    const floor = this.endAt * this.maxHp;
    if (this.endAt > 0 && this.hp <= floor) {
      this.hp = floor;
      this.defeated = true;
      this.move = null; this.threatT = -1; this.targetsPlayer = false;
      if (this.flying) { this.grounded = 99; this.setState('air'); this.vel.set(0, -3, 0); } else this.setState('beaten');
      g.slowmo(0.3, 0.8);
      return true;
    }
    if (this.hp <= 0) { this.hp = 0; this.ko(dir, spec); return true; }
    if (this.armorBroken > 0 || this.grounded > 0) {
      if (spec.knock && this.state !== 'down') { this.setState('down'); }
      else if (this.state !== 'down') { this.setState('stagger'); this.stun = this.dazed > 0 ? this.dazed : 0.35; }
    } else if (this.state !== 'move') this.vel.addScaledVector(dir, (spec.kb || 2) * 0.25);
    return true;
  }

  animate(dt) {
    const c = this.char, p = this.base.reset(), t = this.game.time + this.phase;
    let k = 14;
    const mv = this.moving || 0; this.moving = 0;
    if (this.flying && !this.grounded) {
      P.fall(p, t * 0.7);
      p.set('arL', -0.3, 0, 1.15).set('arR', -0.3, 0, -1.15);
      if (this.state === 'move' && this.move) { evalAction(this.tgt, p, ACT[this.move.anim], Math.min(1, this.t / this.move.dur)); p.copy(this.tgt); }
    } else switch (this.state) {
      case 'move':
        if (this.charging) { this.phase += dt * 16; P.run(p, this.phase, 1, 1); p.set('spine', 0.45, 0, 0).set('head', -0.3, 0, 0); k = 18; break; }
        P.stance(p, t); evalAction(this.tgt, p, ACT[this.move.anim], Math.min(1, this.t / (this.move.dur / this.speedMul()))); p.copy(this.tgt); k = 22; break;
      case 'stagger':
        if (this.dazed > 0) { P.idle(p, t); p.set('spine', 0.35, Math.sin(t * 3) * 0.2, Math.sin(t * 2.3) * 0.15).set('head', 0.4, Math.sin(t * 4) * 0.3, 0); k = 6; break; }
        P.hit(p, 1); k = 18; break;
      case 'down': case 'air': P.down(p); k = 10; break;
      case 'getup': P.idle(p, t); evalAction(this.tgt, p, ACT.getup, Math.min(1, this.t / 0.7)); p.copy(this.tgt); break;
      case 'beaten': P.land(p, 0.85); p.set('head', 0.4, 0, 0); k = 6; break;
      case 'webbed': P.webbed(p, t); break;
      case 'ko': case 'dead': P.down(p); break;
      default:
        if (mv > 0.5) { this.phase += dt * (mv * 0.8 + 2); P.run(p, this.phase, Math.min(1, mv / 6), 0); }
        else P.stance(p, t);
    }
    c.drive(p, k, dt);
    c.root.position.copy(this.pos);
    c.root.rotation.y = this.yaw;
    animateAccessories(c, dt, { t, speed: this.vel.length(), fly: this.flying && !this.grounded, flapRate: this.state === 'move' ? 9 : 5 });
  }
}

// ---------------------------------------------------------------------------
// Five-headed Venom: a hydra of necks rising out of one symbiote mass. Four heads must fall.
class HydraHead {
  constructor(hydra, i) {
    this.hydra = hydra; this.game = hydra.game; this.i = i;
    this.maxHp = this.hp = 340;
    this.pos = new THREE.Vector3();
    this.rest = new THREE.Vector3();
    this.alerted = true; this.isHead = true; this.isBoss = true;
    this.cfg = { xp: 150, ranged: false, heavy: true };
    this.webLevel = 0; this.threatT = -1; this.targetsPlayer = false; this.perfectDodged = false;
    this.radius = 1.3; this.scale = 2.2; this.heavy = true; this.canLaunch = false;
    this.state = 'idle'; this.t = 0; this.stun = 0; this.flashT = 0;
    this.dead = false; this.removed = false;
    this.mat = tendrilMaterial();
    this.neck = new THREE.Mesh(TENDRIL_GEO, this.mat);
    this.neck.frustumCulled = false;
    this.game.scene.add(this.neck);
    this.headMat = lookMaterial('head', { symbiote: true, symType: 'venom' });
    this.head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), this.headMat);
    this.head.scale.set(1.05, 1.2, 1.15);
    this.head.castShadow = true;
    this.game.scene.add(this.head);
  }
  get alive() { return !this.dead; }
  get targetable() { return !this.dead; }
  get airborne() { return true; }
  chest(o = new THREE.Vector3()) { return o.copy(this.pos); }
  update() {}
  webHit() { if (!this.dead) { this.stun = Math.max(this.stun, 1.2); this.flashT = 0.06; } }
  yankTo() { this.webHit(); }
  grabSlam(by) { this.takeHit({ dmg: 24, heavy: true }, null, by); }
  stunned(t) { this.stun = Math.max(this.stun, Math.min(t, 1.5)); }
  remove() {}
  takeHit(spec) {
    if (this.dead || this.hydra.defeated) return false;
    this.hp -= spec.finisher ? 120 : spec.dmg * (this.state === 'down' ? 1.4 : 1);
    this.flashT = 0.06;
    if (this.hp <= 0) {
      this.dead = true; this.hp = 0;
      this.game.fx.dark.emit(this.pos, 80, { speed: 12, up: 6, color: [0.02, 0.0, 0.03], life: 1.2, size: 0.4 });
      this.game.fx.ring(this.pos, 8, 0.6, [2.2, 0.3, 0.6]);
      this.game.audio.boom(); this.game.cam.shake(0.5); this.game.rumble(0.8, 0.8, 400);
      this.game.hud.flashText(`HEAD DESTROYED (${this.hydra.heads.filter((h) => h.dead).length}/4)`, '#ff6a8a');
      this.threatT = -1; this.targetsPlayer = false;
    }
    return true;
  }
}

export class VenomHydra {
  constructor(game, pos) {
    this.game = game; this.pos = pos.clone();
    this.isBoss = true; this.name = 'Venom'; this.defeated = false; this.removed = false;
    const blobMat = new THREE.MeshPhysicalMaterial({ color: 0x050407, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 1, sheenColor: new THREE.Color(0.3, 0.05, 0.3) });
    blobMat.onBeforeCompile = (s) => {
      s.uniforms.uTime = CU.uTime;
      s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nuniform float uTime;\n${GLSL_NOISE}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * (fbm3(position * 1.4 + vec3(0.0, uTime * 0.4, 0.0)) - 0.5) * 0.5;`);
    };
    this.body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), blobMat);
    this.body.scale.set(5.5, 3.6, 5.5);
    this.body.position.copy(pos).y += 2.4;
    this.body.castShadow = true;
    game.scene.add(this.body);
    this.heads = [];
    for (let i = 0; i < 5; i++) {
      const h = new HydraHead(this, i);
      const a = -0.95 + (i / 4) * 1.9;
      h.restAng = a;
      this.heads.push(h);
      game.enemies.push(h);
    }
    this.attackCd = 2.5;
    // rise already facing the player, heads fanned out
    const pl = game.player.pos;
    this.facing = Math.atan2(pl.x - pos.x, pl.z - pos.z);
    const f = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)), side = new THREE.Vector3(f.z, 0, -f.x);
    for (const h of this.heads) h.pos.copy(this.body.position).addScaledVector(side, Math.sin(h.restAng) * 9).addScaledVector(f, 2 + Math.cos(h.restAng) * 3).setY(this.body.position.y + 9);
    this.t = 0;
  }
  get alive() { return !this.defeated; }
  get hp() { return this.heads.reduce((a, h) => a + h.hp, 0); }
  get maxHp() { return this.heads.reduce((a, h) => a + h.maxHp, 0); }
  get killed() { return this.heads.filter((h) => h.dead).length; }

  update(dt) {
    const g = this.game, pl = g.player;
    this.t += dt;
    const frozen = (g.story && g.story.cine) || this.defeated;
    this.facing = dampAngle(this.facing, Math.atan2(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z), 0.8, dt);
    const f = _v.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    const side = _v2.set(f.z, 0, -f.x);
    const base = this.body.position;
    this.attackCd -= dt;
    if (!frozen && this.attackCd <= 0 && pl.state !== 'dead') {
      const live = this.heads.filter((h) => !h.dead && h.state === 'idle');
      if (live.length) {
        const h = live[Math.floor(Math.random() * live.length)];
        const r = Math.random();
        if (r < 0.65) { h.state = 'wind'; h.t = 0; h.target = pl.pos.clone(); h.tele = g.fx.telegraph(h.target, 3.2, 1.1); }
        else { h.state = 'spit'; h.t = 0; }
        this.attackCd = Math.max(0.9, 2.2 - this.killed * 0.3);
      }
    }
    for (const h of this.heads) {
      h.t += dt; h.stun = Math.max(0, h.stun - dt); h.flashT = Math.max(0, h.flashT - dt);
      h.headMat.emissive && h.headMat.emissive.setRGB(h.flashT > 0 ? 0.25 : 0, 0, 0);
      const rest = h.rest.copy(base).addScaledVector(side, Math.sin(h.restAng) * 9).addScaledVector(f, 2 + Math.cos(h.restAng) * 3);
      rest.y = base.y + 9 + Math.sin(this.t * 1.3 + h.i) * 0.8;
      let target = rest;
      if (h.dead) {
        target = _v3.copy(base).setY(base.y + 1);
        h.head.visible = h.pos.distanceTo(target) > 1.5;
      } else if (h.stun > 0) {
        target = _v3.copy(rest).setY(rest.y - 4);
      } else if (h.state === 'wind') {
        h.targetsPlayer = true; h.threatT = 1.1 - h.t;
        target = _v3.copy(rest).setY(rest.y + 2).addScaledVector(f, -2);
        if (h.t > 1.1) { h.state = 'slam'; h.t = 0; }
      } else if (h.state === 'slam') {
        target = h.target.clone().setY(h.target.y + 1.2);
        if (h.t > 0.12 && !h.hit) {
          h.hit = true;
          g.fx.ring(h.target, 5, 0.4, [2, 0.3, 0.5]); g.cam.shake(0.4); g.audio.land(true); g.rumble(0.6, 0.4, 200);
          if (!h.perfectDodged && pl.pos.distanceTo(h.target) < 3.2) pl.hurt(18, h.target);
        }
        if (h.t > 1.8) { h.state = 'idle'; h.hit = false; h.perfectDodged = false; h.threatT = -1; h.targetsPlayer = false; }
        else if (h.t > 0.12) { h.threatT = -1; h.targetsPlayer = false; }
        h.state === 'slam' && (h.lowT = h.t);
      } else if (h.state === 'spit') {
        target = _v3.copy(rest).addScaledVector(f, -1.5);
        if (h.t > 0.7 && !h.fired) {
          h.fired = true;
          const v = pl.chestPos(new THREE.Vector3()).sub(h.pos);
          const flat = Math.hypot(v.x, v.z);
          const T = Math.max(0.6, flat / 22);
          projectiles(g).fire('goo', h.pos.clone(), new THREE.Vector3(v.x / T, v.y / T + 7 * T, v.z / T), 10);
          g.audio.hive();
        }
        if (h.t > 1.2) { h.state = 'idle'; h.fired = false; }
      }
      const kk = h.state === 'slam' && h.t < 0.25 ? 18 : 4;
      h.pos.lerp(target, damp(kk, dt));
      h.head.position.copy(h.pos);
      h.head.lookAt(h.state === 'slam' ? h.target : pl.chestPos(_v3));
      // neck: bezier from the body up and over into the head
      const u = h.mat.userData.u;
      u.uP0.value.copy(base).addScaledVector(side, Math.sin(h.restAng) * 2.5).setY(base.y + 2.5);
      u.uP3.value.copy(h.pos).addScaledVector(_v3.copy(h.pos).sub(base).setY(0).normalize(), -0.8);
      u.uP1.value.copy(u.uP0.value).setY(u.uP0.value.y + 5);
      u.uP2.value.copy(u.uP3.value).setY(u.uP3.value.y + 3).addScaledVector(f, -2);
      u.uR0.value = h.dead ? 0.6 : 0.95; u.uR1.value = h.dead ? 0.3 : 0.62;
      if (h.dead) u.uP3.value.lerp(u.uP0.value, 0.6);
    }
  }

  remove() {
    this.removed = true;
    this.body.removeFromParent();
    for (const h of this.heads) {
      h.neck.removeFromParent(); h.head.removeFromParent(); h.dead = true; h.removed = true;
      const i = this.game.enemies.indexOf(h); if (i >= 0) this.game.enemies.splice(i, 1);
    }
  }
}
