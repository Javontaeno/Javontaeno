import * as THREE from 'three';
import { Character, P, ACT, evalAction, Pose } from './character.js';
import { animateAccessories } from './accessories.js';
import { dampAngle } from './util.js';

// Named characters. Every look is built procedurally from these descriptions.
export const CAST = {
  spidey: { name: 'Spider-Man', color: '#ff4d57' },
  mj: { name: 'Mary Jane', color: '#ff8a5c', build: 'female', look: { skin: '#f3cfb4', hair: '#b8361c', top: '#2f6a3a', topKind: 'tee', pants: '#2c3d63', shoe: '#5a3a22', lips: '#b52a3a', female: true, eyes: '#2f6a3a', acc: ['hairLong', 'camera'] },
    moves: [{ a: 'pipe', dmg: 11, kb: 4, dur: 1.0 }], ranged: null },
  luke: { name: 'Luke Cage', color: '#f2c23a', build: 'big', look: { skin: '#5e3b26', top: '#e8b820', topKind: 'tee', pants: '#1a1a1a', shoe: '#222', hairStyle: 'bald', belt: '#9aa0a6', beltColor: 0xa7adb3, acc: ['belt', 'tiara'] },
    moves: [{ a: 'punch', dmg: 16, kb: 6, dur: 0.95 }, { a: 'punch', dmg: 16, kb: 6, dur: 0.95 }, { a: 'smash', dmg: 24, kb: 9, aoe: 4, dur: 1.2, knock: true }] },
  cat: { name: 'Black Cat', color: '#e6e6e6', build: 'female', look: { skin: '#f3cfb4', top: '#0d0d10', topKind: 'body', pattern: 'cat', hair: '#f2f2f2', mask: 'domino', lips: '#7a1a2a', female: true, acc: ['hairLong', 'cuffs'] },
    moves: [{ a: 'kick', dmg: 11, kb: 4, dur: 0.6 }, { a: 'spin', dmg: 14, kb: 8, dur: 0.7, knock: true }], ranged: { kind: 'whip', dmg: 10, cd: 4 } },
  moon: { name: 'Moon Knight', color: '#e8ecf2', build: 'lean', look: { top: '#e9ebee', topKind: 'body', pattern: 'moon', mask: 'moon', gloves: '#d8dadf', boots: '#d8dadf', acc: ['hood', 'cape'] },
    moves: [{ a: 'kick', dmg: 13, kb: 5, dur: 0.65 }, { a: 'jab', dmg: 11, kb: 3, dur: 0.45 }], ranged: { kind: 'darts', dmg: 12, cd: 3.2 } },
  vulture: { name: 'Vulture', color: '#7ad67a', build: 'lean', look: { skin: '#d7b49a', top: '#2e6b3a', topKind: 'body', pattern: 'vulture', hairStyle: 'bald', gloves: '#1f4a28', boots: '#1f4a28', acc: ['wings', 'collar'] },
    moves: [{ a: 'kick', dmg: 12, kb: 5, dur: 0.6 }] },
  kingpin: { name: 'Kingpin', color: '#c9a8ff', build: 'kingpin', look: { skin: '#e8c0a0', top: '#efece6', topKind: 'suit', tie: '#5b2a7a', shirt: '#d9c8f0', pants: '#efece6', shoe: '#222', hairStyle: 'bald', acc: ['cane'] } },
  wolverine: { name: 'Wolverine', color: '#ffd23a', build: 'stocky', look: { skin: '#d9a988', top: '#f2c21b', topKind: 'body', pattern: 'wolverine', accent: '#1e3a8a', gloves: '#1e3a8a', boots: '#1e3a8a', mask: 'wolverine', acc: ['claws', 'wolvFins'] },
    moves: [{ a: 'slash', dmg: 12, kb: 3, dur: 0.55 }, { a: 'slash', dmg: 12, kb: 3, dur: 0.55 }, { a: 'upper', dmg: 18, kb: 6, dur: 0.7, knock: true }] },
  widow: { name: 'Black Widow', color: '#ff5a5a', build: 'female', look: { skin: '#f1c9ae', top: '#121216', topKind: 'body', pattern: 'widow', hair: '#b8361c', lips: '#9a1f2a', female: true, belt: '#d9b44a', beltColor: 0xd9b44a, acc: ['hairLong', 'belt', 'pistol'] },
    moves: [{ a: 'kick', dmg: 12, kb: 4, dur: 0.55 }, { a: 'jab', dmg: 10, kb: 3, dur: 0.45 }, { a: 'spin', dmg: 14, kb: 7, dur: 0.7, knock: true }], ranged: { kind: 'guns', dmg: 6, cd: 2.6 } },
  electro: { name: 'Electro', color: '#f2e23a', build: 'lean', look: { top: '#3d8b2a', topKind: 'body', pattern: 'electro', accent: '#f2d21b', mask: 'electro', gloves: '#f2d21b', boots: '#f2d21b', acc: ['electroStar'] } },
  tinkerer: { name: 'Tinkerer', color: '#a8e08a', build: 'old', look: { skin: '#e3bfa3', top: '#5a4a32', topKind: 'jacket', pants: '#3a3326', hair: '#d8d8d8', hairStyle: 'bald', beard: '#cfcfcf', acc: ['hairBalding'] } },
  eddie: { name: 'Eddie Brock', color: '#cfcfcf', build: 'lean', look: { skin: '#e8c0a0', top: '#5a5f66', topKind: 'tee', pants: '#2a3a5a', hair: '#d9b65a', acc: ['hairShort'] } },
  r7boss: { name: 'Rolling 7s Boss', color: '#ff6a5a', build: 'big', look: { skin: '#8d5a3c', top: '#8a1414', topKind: 'jacket', stripe: '#e8e8e8', pants: '#1a1a1a', hair: '#1a1410', acc: ['hairShort', 'pistol'] } },
  paboss: { name: 'Park Avenues Boss', color: '#6aa0ff', build: 'big', look: { skin: '#e0b49a', top: '#1b3f8a', topKind: 'suit', tie: '#d8c060', pants: '#1b3f8a', hair: '#2a1a10', acc: ['hairShort', 'pistol'] } },
  agent: { name: 'S.H.I.E.L.D. Agent', color: '#9fb7ff', build: 'lean', look: { skin: '#c68f6e', top: '#1c2840', topKind: 'body', pattern: 'shield', gloves: '#111', boots: '#111', hair: '#1a1410', acc: ['hairShort', 'rifle'] } },
  medic: { name: 'Paramedic', color: '#bfe0ff', build: 'thug', look: { skin: '#e0b49a', top: '#2a4a8a', topKind: 'jacket', stripe: '#e8e8e8', pants: '#1a2a4a', hair: '#3a2a1a', acc: ['hairShort'] } },
  anchor: { name: 'News Anchor', color: '#ffd28a' },
  figure: { name: '???', color: '#9a8cff' },
  symcat: { name: 'Black Cat (Symbiote)', color: '#c79bff', build: 'female', look: { symbiote: true, symType: 'cat', vein: [0.8, 0.1, 1.0], hair: '#f2f2f2', acc: ['hairLong', 'spines'] } },
  symwolv: { name: 'Wolverine (Symbiote)', color: '#ffb02e', build: 'stocky', look: { symbiote: true, symType: 'wolverine', vein: [1.0, 0.6, 0.1], acc: ['claws', 'wolvFins'] } },
  venom: { name: 'Venom', color: '#b9b9ff', build: 'venom', look: { symbiote: true, symType: 'venom', acc: ['tongue'] } },
  rhino: { name: 'Rhino', color: '#b4b8be', build: 'rhino', look: { skin: '#d9b49a', top: '#4f5257', topKind: 'body', pattern: 'rhino', mask: 'rhino', gloves: '#3f4246', boots: '#3f4246', rough: 0.62, acc: ['horn'] } },
  symrhino: { name: 'Rhino (Symbiote)', color: '#ff8a4a', build: 'rhino', look: { symbiote: true, symType: 'rhino', vein: [1.0, 0.35, 0.08], hornColor: 0x16121a, acc: ['horn', 'spines'] } },
  deadpool: { name: 'Deadpool', color: '#ff4040', build: 'lean', look: { top: '#a3121a', topKind: 'body', pattern: 'deadpool', mask: 'deadpool', gloves: '#141416', boots: '#1a1a1c', belt: '#3a2c1e', acc: ['katanas', 'pouches'] },
    moves: [{ a: 'slash', dmg: 13, kb: 3, dur: 0.5 }, { a: 'slash', dmg: 13, kb: 3, dur: 0.5 }, { a: 'spin', dmg: 16, kb: 7, dur: 0.7, knock: true }], ranged: { kind: 'guns', dmg: 6, cd: 3 }, poof: [0.9, 0.12, 0.1] },
  nightcrawler: { name: 'Nightcrawler', color: '#8a9cff', build: 'lean', look: { skin: '#2a3c80', top: '#141419', topKind: 'body', pattern: 'nightcrawler', accent: '#a3182a', hair: '#0e1430', glowEyes: '#f2d23a', gloves: '#e8e8e8', boots: '#e8e8e8', bareNeck: true, acc: ['hairShort', 'tail', 'ears'] },
    moves: [{ a: 'kick', dmg: 11, kb: 4, dur: 0.55 }, { a: 'jab', dmg: 10, kb: 3, dur: 0.45 }, { a: 'spin', dmg: 14, kb: 7, dur: 0.7, knock: true }], ranged: { kind: 'bamf', dmg: 15, cd: 3.2 }, poof: [0.35, 0.1, 0.6] },
  fury: { name: 'Nick Fury', color: '#a8bfff', build: 'lean', look: { skin: '#e0b49a', top: '#1b1d22', topKind: 'jacket', pants: '#1b1d22', shoe: '#0c0c0c', hair: '#4a3a2a', temples: '#bdbdbd', eyepatch: true, coatColor: 0x1b1d22, acc: ['hairShort', 'coat', 'pistol'] } },
  shocker: { name: 'Shocker', color: '#e0b24a', build: 'lean', look: { top: '#c9a03a', topKind: 'body', pattern: 'shocker', mask: 'shocker', gloves: '#6b4a1a', boots: '#6b4a1a', acc: ['gauntlets'] } },
  ironman: { name: 'Iron Man', color: '#ff6a3a', build: 'big', look: { top: '#a3161a', topKind: 'body', pattern: 'iron', mask: 'iron', accent: '#d8a63a', gloves: '#a3161a', boots: '#a3161a', metal: true, acc: ['reactor', 'ironEyes', 'thrusters'] },
    ranged: { kind: 'repulsor', dmg: 22, cd: 1.4 } },
  fantastic: { name: 'Mr. Fantastic', color: '#6aa0ff', build: 'lean', look: { skin: '#e8c0a0', top: '#1f4fb0', topKind: 'body', pattern: 'fantastic', hair: '#3a2a1c', temples: '#d8d8d8', gloves: '#0d0d10', boots: '#0d0d10', bareNeck: true, acc: ['hairShort'] } },
  goon: { name: "Fisk's Man", color: '#c9a8ff', build: 'thug', look: { skin: '#c68f6e', top: '#141418', topKind: 'suit', tie: '#1a1a1a', shirt: '#e8e8e8', pants: '#141418', shoe: '#0c0c0c', hair: '#1a1410', acc: ['hairShort', 'pistol'] } },
  sister: { name: "Electro's Sister", color: '#c79bff', build: 'female', look: { skin: '#e8c0a0', hair: '#2a1a10', top: '#6a4a7a', topKind: 'jacket', pants: '#2a2a3a', female: true, goo: true, acc: ['hairLong'] } },
  cop: { name: 'NYPD Officer', color: '#8ab4ff', build: 'thug', look: { skin: '#c68f6e', top: '#1a2a4a', topKind: 'jacket', pants: '#1a2a4a', hat: '#141c30', hair: '#1a1410', logo: '#d8c060', logoText: '★', acc: ['pistol'] } },
  symelectro: { name: 'Electro (Symbiote)', color: '#f2e23a', build: 'lean', look: { symbiote: true, symType: 'electro', vein: [1.0, 0.85, 0.1], accent: '#f2d21b', acc: ['electroStar'] } },
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

// A named character in the world: a cutscene performer (mode 'npc') or a fighting companion (mode 'ally').
export class Actor {
  constructor(game, id, pos, opts = {}) {
    const c = CAST[id];
    this.game = game; this.id = id; this.cast = c;
    const look = { ...c.look, build: c.build, seed: 500 + id.length, acc: [...((c.look && c.look.acc) || []), ...(opts.acc || [])] };
    this.char = new Character(c.look && c.look.symbiote ? 'symbiote' : 'thug', look);
    game.scene.add(this.char.root);
    this.pos = pos.clone();
    this.yaw = opts.yaw ?? 0;
    this.vel = new THREE.Vector3();
    this.mode = opts.ally ? 'ally' : 'npc';
    this.pose = opts.pose || 'idle';
    this.act = null; this.cd = 0.5; this.rangedCd = 2; this.target = null; this.combo = 0;
    this.walkTo = null; this.walkSpeed = 6;
    this.base = new Pose(); this.tgt = new Pose();
    this.phase = Math.random() * 10;
    this.fly = !!opts.fly;
    this.lookAt = null;
    this.removed = false;
    this.pending = [];
    this.turret = opts.turret || null; // {center: Vector3, height}: hovering gunship support (Iron Man)
    this.life = opts.life || 0; // call-in allies leave when this runs out
    this.place(pos);
  }

  place(p, yaw) {
    this.pos.copy(p);
    if (!this.fly) this.pos.y = this.game.city.groundAt(p.x, p.z, p.y + 1.5);
    if (yaw !== undefined) this.yaw = yaw;
  }

  face(p) { this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }
  chest(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + 1.3 * this.char.scale); }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.char.dispose();
  }

  update(dt) {
    const g = this.game;
    const cine = g.story && g.story.cine;
    let moving = 0;
    for (const p of this.pending) { p.t -= dt; if (p.t <= 0) p.fn(); }
    this.pending = this.pending.filter((p) => p.t > 0);
    if (this.life > 0) {
      this.life -= dt;
      if (this.life <= 0) { this.poof(); this.remove(); return; }
    }
    if (this.turret && !cine) { this.turretAI(dt); this.animate(dt, 0); return; }
    if (this.walkTo) {
      const to = _v.copy(this.walkTo).sub(this.pos); to.y = 0;
      const d = to.length();
      if (d < 0.3) this.walkTo = null;
      else { to.divideScalar(d); const sp = Math.min(this.walkSpeed, d / dt); this.pos.addScaledVector(to, sp * dt); this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 10, dt); moving = sp; }
      if (!this.fly) this.pos.y = g.city.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5);
    } else if (this.mode === 'ally' && !cine) moving = this.allyAI(dt);
    if (this.lookAt && !moving && !this.act) this.yaw = dampAngle(this.yaw, Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z), 6, dt);
    this.animate(dt, moving);
  }

  allyAI(dt) {
    const g = this.game, pl = g.player, c = this.cast;
    this.cd -= dt; this.rangedCd -= dt;
    // finish the current swing
    if (this.act) {
      this.act.t += dt;
      const a = this.act, k = a.t / a.m.dur;
      if (!a.done && k >= (ACT[a.m.a].hit || 0.5)) { a.done = true; this.strike(a.m, a.target); }
      if (a.target && a.target.alive && k < 0.4) {
        const to = _v.copy(a.target.pos).sub(this.pos); to.y = 0;
        const d = to.length();
        if (d > 1.6) this.pos.addScaledVector(to.normalize(), Math.min(9, d) * dt);
        this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 14, dt);
      }
      if (k >= 1) this.act = null;
      this.pos.y = g.city.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5);
      return 0;
    }
    // pick the nearest hostile near the player
    let best = null, bd = 1e9;
    for (const e of g.enemies) {
      if (!e.targetable || e.isHydraBody) continue;
      if (e.pos.distanceTo(pl.pos) > 30) continue;
      if (Math.abs(e.pos.y - this.pos.y) > 4 && !e.airborne) continue;
      const d = e.pos.distanceTo(this.pos);
      if (d < bd) { bd = d; best = e; }
    }
    // keep up with the player — allies can't web-swing, so they catch up off-screen
    const dp = this.pos.distanceTo(pl.pos);
    if ((dp > 40 || Math.abs(pl.pos.y - this.pos.y) > 7) && pl.state !== 'swing' && pl.state !== 'air' && pl.state !== 'zip') {
      const side = _v2.set(Math.cos(pl.yaw), 0, -Math.sin(pl.yaw)).multiplyScalar(-2.5);
      const p = pl.pos.clone().add(side);
      if (Math.abs(g.city.groundAt(p.x, p.z, pl.pos.y + 1) - pl.pos.y) < 0.6) {
        this.poof();
        this.place(p);
        this.poof(true);
      }
    }
    if (best) {
      this.target = best;
      const to = _v.copy(best.pos).sub(this.pos); to.y = 0;
      const d = to.length();
      this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 10, dt);
      if (c.ranged && this.rangedCd <= 0 && d > 4 && d < 16) { this.rangedCd = c.ranged.cd; this.ranged(best); return 0; }
      if (d > 2.1) { this.stepTowards(to.normalize(), Math.min(8.5, d), dt); return 8.5; }
      if (this.cd <= 0 && c.moves) {
        const m = c.moves[this.combo++ % c.moves.length];
        this.act = { m, t: 0, done: false, target: best };
        this.cd = 0.35 + Math.random() * 0.4;
      }
      return 0;
    }
    // follow at the player's shoulder
    const want = _v2.set(Math.cos(pl.yaw), 0, -Math.sin(pl.yaw)).multiplyScalar(2.6).add(pl.pos);
    const to = want.sub(this.pos); to.y = 0;
    const d = to.length();
    if (d > 3.2) { this.stepTowards(to.normalize(), d > 12 ? 11 : 6.5, dt); this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 8, dt); return d > 12 ? 11 : 6.5; }
    return 0;
  }

  stepTowards(dir, speed, dt) {
    const g = this.game;
    const nx = this.pos.x + dir.x * speed * dt, nz = this.pos.z + dir.z * speed * dt;
    const gy = g.city.groundAt(nx, nz, this.pos.y + 1);
    if (Math.abs(gy - this.pos.y) > 1.2) return;
    this.pos.x = nx; this.pos.z = nz; this.pos.y = gy;
  }

  strike(m, t) {
    const g = this.game;
    const targets = [];
    if (m.aoe) { for (const e of g.enemies) if (e.targetable && e.pos.distanceTo(this.pos) < m.aoe) targets.push(e); g.fx.ring(this.pos, m.aoe + 2, 0.4); g.cam.shake(0.15); }
    else if (t && t.alive && t.pos.distanceTo(this.pos) < 3.2) targets.push(t);
    for (const e of targets) {
      const dir = _v.copy(e.pos).sub(this.pos).setY(0).normalize();
      if (e.takeHit({ dmg: m.dmg, kb: m.kb, stun: 0.5, knock: m.knock, up: m.knock ? 4 : 0, heavy: !!m.knock, ally: true }, dir, null)) {
        g.fx.hitSpark(e.chest(_v2), !!m.knock, false);
        g.audio.punch(!!m.knock, false);
      }
    }
  }

  // Teleport smoke (Nightcrawler's brimstone, Deadpool's belt) or a plain dust puff.
  poof(arrive = false) {
    const g = this.game, c = this.cast.poof;
    const p = this.pos.clone().setY(this.pos.y + 1);
    if (c) {
      g.fx.dark.emit(p, 26, { speed: 4, up: 1.5, color: [c[0] * 0.25, c[1] * 0.25, c[2] * 0.25], life: 0.9, size: 0.45, gravity: -1 });
      g.fx.add.emit(p, 12, { speed: 3, color: [c[0] * 2, c[1] * 2, c[2] * 2], life: 0.4, size: 0.18 });
      if (arrive) g.audio.tone({ freq: 180, to: 90, type: 'sawtooth', dur: 0.14, gain: 0.08 });
    } else if (arrive) g.fx.add.emit(p, 14, { speed: 4, color: [1.5, 1.5, 1.6], life: 0.4, size: 0.12 });
    else g.fx.dark.emit(p, 10, { speed: 3, color: [0.1, 0.1, 0.12], life: 0.4, size: 0.3 });
  }

  later(t, fn) { this.pending.push({ t, fn }); }

  hitTarget(t, dmg, kb = 3, stun = 0.6) {
    if (!t.alive) return;
    const g = this.game;
    if (t.takeHit({ dmg, kb, stun, ally: true }, _v.copy(t.pos).sub(this.pos).setY(0).normalize(), null)) { g.fx.hitSpark(t.chest(_v2), false, false); g.audio.punch(false, false); }
  }

  ranged(t) {
    const g = this.game, r = this.cast.ranged;
    const from = this.char.handWorld('R', new THREE.Vector3());
    const to = t.chest(new THREE.Vector3());
    switch (r.kind) {
      case 'whip': g.fx.webLine(from, to, 0.25, 0.015); break;
      case 'guns':
        for (let i = 0; i < 3; i++) this.later(i * 0.12, () => { if (!t.alive) return; g.fx.tracer(this.char.handWorld(i % 2 ? 'L' : 'R', _v2), t.chest(_v)); g.audio.gun(this.pos.distanceTo(g.player.pos)); this.hitTarget(t, r.dmg, 1, 0.3); });
        this.act = { m: { a: 'aim', dur: 0.5, dmg: 0 }, t: 0, done: true, target: null };
        return;
      case 'bamf': {
        // vanish, reappear behind the target, strike
        this.poof();
        const behind = _v.copy(t.pos).sub(g.player.pos).setY(0);
        if (behind.lengthSq() < 0.01) behind.set(1, 0, 0);
        behind.normalize().multiplyScalar(1.6).add(t.pos);
        const gy = g.city.groundAt(behind.x, behind.z, t.pos.y + 1);
        if (Math.abs(gy - t.pos.y) < 1 && !g.city.pointInBox(_v2.set(behind.x, gy + 0.9, behind.z), 0.2)) this.place(behind.setY(gy));
        else this.place(t.pos.clone().add(_v2.set(0.8, 0, 0.8)));
        this.face(t.pos);
        this.poof(true);
        this.act = { m: { a: 'spin', dur: 0.6, dmg: r.dmg, kb: 6, knock: true }, t: 0, done: false, target: t };
        return;
      }
      case 'repulsor':
        g.fx.line(from, to, 0x9fe8ff, 0.18, 0.06);
        g.fx.add.emit(to, 16, { speed: 6, color: [2, 3, 4], life: 0.3, size: 0.15 });
        g.audio.tone({ freq: 900, to: 300, type: 'sawtooth', dur: 0.2, gain: 0.07 });
        this.hitTarget(t, r.dmg, 7, 0.8);
        return;
      default: g.fx.tracer(from, to);
    }
    this.act = { m: { a: r.kind === 'whip' ? 'webShot' : 'bomb', dur: 0.45, dmg: 0 }, t: 0, done: true, target: null };
    this.later(0.2, () => this.hitTarget(t, r.dmg));
  }

  // Hover over the fight and pick off enemies near the player.
  turretAI(dt) {
    const g = this.game, pl = g.player, T = this.turret;
    this.rangedCd -= dt;
    const c = T.center || pl.pos;
    const ang = (this.orbitA = (this.orbitA || 0) + dt * 0.35);
    const want = _v.set(c.x + Math.cos(ang) * (T.r || 12), c.y + (T.height || 10), c.z + Math.sin(ang) * (T.r || 12));
    this.pos.lerp(want, Math.min(1, dt * 1.5));
    let best = null, bd = 1e9;
    for (const e of g.enemies) {
      if (!e.targetable || e.isHead) continue;
      const d = e.pos.distanceTo(pl.pos);
      if (d < 40 && d < bd) { bd = d; best = e; }
    }
    if (best) {
      this.face(best.pos);
      if (this.rangedCd <= 0) { this.rangedCd = this.cast.ranged.cd; this.ranged(best); }
    } else this.face(pl.pos);
    if (this.act) { this.act.t += dt; if (this.act.t > this.act.m.dur) this.act = null; }
  }

  animate(dt, moving) {
    const c = this.char, p = this.base.reset(), t = this.game.time + this.phase;
    let k = 12;
    if (this.act) {
      P.stance(p, t);
      evalAction(this.tgt, p, ACT[this.act.m.a], Math.min(1, this.act.t / this.act.m.dur));
      p.copy(this.tgt); k = 22;
    } else if (this.turret || (this.fly && this.pose === 'hover')) {
      P.fall(p, t * 0.6); p.set('arL', -0.2, 0, 0.5).set('arR', -0.2, 0, -0.5).set('thL', 0.1, 0, 0.05).set('thR', 0.1, 0, -0.05).set('knL', 0.2, 0, 0).set('knR', 0.2, 0, 0);
    } else if (moving > 0.5) {
      this.phase += dt * (moving * 0.8 + 2);
      P.run(p, this.phase, Math.min(1, moving / 6), moving > 9 ? 1 : 0);
    } else {
      switch (this.pose) {
        case 'stance': P.stance(p, t); break;
        case 'injured': P.down(p); break;
        case 'kneel': P.land(p, 0.8); break;
        case 'aim': P.idle(p, t); evalAction(this.tgt, p, ACT.aim, 0.5); p.copy(this.tgt); break;
        case 'cross': P.idle(p, t); p.set('arL', -0.9, 0.6, 0.6).set('elL', -2.1, 0, 0).set('arR', -0.9, -0.6, -0.6).set('elR', -2.1, 0, 0); break;
        case 'talk': P.idle(p, t); p.set('arR', -0.6 + Math.sin(t * 2) * 0.2, 0, -0.3).set('elR', -1.2, 0, 0); break;
        case 'hover': P.fall(p, t * 0.6); p.set('arL', -0.2, 0, 1.2).set('arR', -0.2, 0, -1.2); break;
        case 'perch': P.perch(p, t); break;
        case 'webbed': P.webbed(p, t); break;
        default: if (this.mode === 'ally' && this.game.player.inCombat) P.stance(p, t); else P.idle(p, t);
      }
    }
    c.drive(p, k, dt);
    c.root.position.copy(this.pos);
    c.root.rotation.y = this.yaw;
    animateAccessories(c, dt, { t, speed: moving, fly: this.fly || this.pose === 'hover' || !!this.turret });
  }
}
