import * as THREE from 'three';
import { Character, P, ACT, evalAction, HERO_U, Pose } from './character.js';
import { L } from './city.js';
import { clamp, dampAngle, lerp, UP } from './util.js';

const G = 30;
const RUN = 9.5, SPRINT = 17.5;
const HAND_Y = 1.25; // swing constraint point above the feet

const HIT = {
  jab: { dmg: 9, kb: 2.8, stun: 0.4, reach: 2.5 },
  cross: { dmg: 9, kb: 2.8, stun: 0.4, reach: 2.5 },
  hook: { dmg: 11, kb: 4, stun: 0.5, reach: 2.6 },
  knee: { dmg: 12, kb: 3, up: 1.5, stun: 0.55, reach: 2.3 },
  kick: { dmg: 12, kb: 5.5, stun: 0.5, reach: 2.8 },
  spin: { dmg: 17, kb: 10, up: 3, knock: true, reach: 3.0, aoe: 1.9, heavy: true },
  upper: { dmg: 12, launch: 11.5, reach: 2.6, heavy: true },
  airA: { dmg: 8, juggle: true, reach: 3.0 },
  airB: { dmg: 9, juggle: true, reach: 3.0 },
  airC: { dmg: 16, spike: true, reach: 3.2, heavy: true },
  slam: { dmg: 20, knock: true, kb: 7, up: 4, aoe: 4.8, heavy: true, reach: 4.8 },
  webStrike: { dmg: 14, kb: 9, up: 2, knock: true, reach: 3.0, heavy: true },
  counter: { dmg: 26, kb: 11, up: 4, knock: true, reach: 3.2, heavy: true },
  finisher: { dmg: 9999, kb: 16, up: 7, knock: true, reach: 5, heavy: true, finisher: true },
  tendrilA: { dmg: 15, kb: 6, stun: 0.5, aoe: 4.0, cone: 0.1, reach: 4.0, heavy: true, black: true },
  tendrilB: { dmg: 15, kb: 6, stun: 0.5, aoe: 4.0, cone: 0.1, reach: 4.0, heavy: true, black: true },
  tendrilC: { dmg: 24, kb: 9, up: 3, knock: true, aoe: 4.8, cone: -0.3, reach: 4.8, heavy: true, black: true },
  yank: { dmg: 10, stun: 0.8, kb: 1, reach: 3.2 },
  grab: { dmg: 22, knock: true, kb: 2, up: 3, reach: 40, heavy: true, black: true },
  surge: { dmg: 32, kb: 12, up: 6, knock: true, aoe: 9, cone: -1.1, heavy: true, black: true, reach: 9 },
};
const DUR = {
  jab: 0.3, cross: 0.3, hook: 0.34, knee: 0.36, kick: 0.42, spin: 0.58, upper: 0.45, airA: 0.28, airB: 0.3, airC: 0.46, slam: 0.55,
  webStrike: 0.5, counter: 0.5, finisher: 1.0, webShot: 0.28, yank: 0.55, bomb: 0.38, tendrilA: 0.36, tendrilB: 0.36,
  tendrilC: 0.5, surge: 0.65, dodge: 0.42, roll: 0.4, rollL: 0.4, flip: 0.5,
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _n = new THREE.Vector3(), _hit = {};
// ground combo strings; a string is picked at random each time a combo starts, always ending on the spin kick
const COMBOS = [['jab', 'cross', 'kick', 'spin'], ['jab', 'hook', 'knee', 'spin'], ['cross', 'hook', 'kick', 'spin']];

const NO_MOVE = { x: 0, y: 0 };
export class Player {
  constructor(game) {
    this.game = game;
    this.char = new Character('hero');
    game.scene.add(this.char.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.yawVis = 0;
    this.state = 'air'; this.stateT = 0;
    this.hp = 120; this.maxHp = 120; this.focus = 0.5;
    this.combo = 0; this.comboT = 0; this.bestCombo = 0;
    this.chain = 0; this.chainT = 0;
    this.suit = 'red'; this.suitMix = 0;
    this.invuln = 0; this.counterT = 0; this.lastHurt = 99; this.hurtT = 0;
    this.act = null; this.queued = false;
    this.target = null;
    this.swing = { anchor: new THREE.Vector3(), len: 0, t: 0, min: 8 };
    this.wall = { n: new THREE.Vector3(), box: null, phase: 0, mom: 0 };
    this.zip = { from: new THREE.Vector3(), to: new THREE.Vector3(), point: new THREE.Vector3(), t: 0, dur: 0, kind: '', n: new THREE.Vector3(), box: null };
    this.perchDir = new THREE.Vector3(0, 0, 1);
    this.airDashes = 0; this.dashCd = 0; this.dashT = 0; this.swingCd = 0; this.wallCd = 0; this.bombCd = 0; this.wallPush = 0;
    this.runPhase = 0; this.landT = 0; this.landK = 0; this.airAttacks = 0;
    this.flipT = 0; this.flipName = 'flip';
    this.charge = 0; this.charging = false;
    this.aim = { valid: false, point: new THREE.Vector3(), normal: new THREE.Vector3(), box: null, kind: '', enemy: null };
    this.inCombat = false;
    this.deadT = 0;
    this.basePose = new Pose();
    this.tgtPose = new Pose();
    this.flipPose = new Pose();
    this.moveDir = new THREE.Vector3();
    this.mv = { x: 0, y: 0 };
    this.sense = 0;
    this.airTime = 0;
    this.webHold = 0; this.webYanked = false;
    this.stats = { kos: 0, hives: 0, events: 0, perfect: 0, launches: 0, airHits: 0, webStrikes: 0, hits: 0, jumps: 0, swingTime: 0, wallTime: 0, zips: 0, webHits: 0, suitSwaps: 0, walked: 0, dodges: 0 };
    this.lock = null; this.lastAttack = 99;
  }

  get black() { return this.suit === 'black'; }
  get dmgMult() { return (1 + 0.07 * (this.game.level - 1)) * (this.black ? 1.3 : 1); }
  chestPos(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + 1.35); }

  spawn(p) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.state = 'air';
    this.act = null;
  }

  // -------------------------------------------------------------------------
  update(dt) {
    const g = this.game, inp = g.input, cam = g.cam;
    this.stateT += dt;
    for (const k of ['invuln', 'counterT', 'dashCd', 'dashT', 'swingCd', 'wallCd', 'bombCd', 'comboT', 'chainT', 'landT', 'flipT', 'hurtT']) this[k] = Math.max(0, this[k] - dt);
    this.lastHurt += dt;
    if (this.comboT <= 0 && this.combo > 0) { this.combo = 0; }
    if (this.chainT <= 0 && !this.act) this.chain = 0;
    const want = this.black ? 1 : 0;
    this.suitMix += clamp(want - this.suitMix, -dt * 1.4, dt * 1.4);
    if (!this.black && this.lastHurt > 5 && this.hp < this.maxHp && this.state !== 'dead') this.hp = Math.min(this.maxHp, this.hp + 4 * dt);
    this.sense = Math.max(0, this.sense - dt * 2.5);

    if (this.state === 'dead') {
      this.deadT += dt;
      this.vel.set(0, 0, 0);
      if (this.deadT > 3.2) this.respawn();
      this.animate(dt);
      return;
    }

    // cutscenes take the controls away (and keep you safe)
    const locked = g.story && g.story.cine;
    if (locked) { this.invuln = Math.max(this.invuln, 0.3); this.charging = false; }
    // movement intent relative to the camera
    const mv = (this.mv = locked ? NO_MOVE : inp.move);
    const f = cam.forwardH(_v), r = cam.rightH(_v2);
    this.moveDir.set(0, 0, 0).addScaledVector(f, mv.y).addScaledVector(r, mv.x);
    const mlen = this.moveDir.length();
    if (mlen > 1) this.moveDir.divideScalar(mlen);

    if (locked) { this.aim.valid = false; this.aim.enemy = null; if (this.state === 'swing') this.releaseSwing(false); } else this.updateAim();
    if (this.act) this.updateAction(dt);
    if (!locked) this.handleInput(dt);

    // physics in substeps
    const speed = this.vel.length();
    const steps = clamp(Math.ceil((speed * dt) / 0.28), 1, 10);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      switch (this.state) {
        case 'ground': this.stepGround(h); break;
        case 'air': this.stepAir(h); break;
        case 'swing': this.stepSwing(h); break;
        case 'wall': this.stepWall(h); break;
        case 'zip': this.stepZip(h); break;
        case 'perch': this.vel.set(0, 0, 0); break;
      }
    }
    if (this.state === 'air') this.airTime += dt; else this.airTime = 0;
    if (this.state === 'swing') this.stats.swingTime += dt;
    if (this.state === 'wall') this.stats.wallTime += dt;
    if (this.state === 'ground') this.stats.walked += Math.hypot(this.vel.x, this.vel.z) * dt;
    this.lastAttack += dt;
    this.updateLock();
    // fell into the river
    if (this.pos.y < L.WATER_Y - 0.3) {
      g.fx.add.emit(this.pos, 40, { speed: 8, up: 6, color: [0.6, 0.7, 0.8], life: 0.8, size: 0.25 });
      g.toast('Out of the water...');
      this.respawn(true);
    }
    this.animate(dt);
  }

  // -------------------------------------------------------------------------
  updateAim() {
    const g = this.game, cam = g.cam;
    const o = g.camera.position, d = cam.forward(_v3);
    const a = this.aim;
    a.valid = false; a.enemy = null;
    // enemy under the crosshair?
    let best = null, bd = g.input.usingPad ? 0.22 : 0.13; // wider cone for analog sticks
    for (const e of g.enemies) {
      if (!e.targetable) continue;
      const c = e.chest(_v);
      const to = _v2.copy(c).sub(o);
      const dist = to.length();
      if (dist > 45) continue;
      to.divideScalar(dist);
      const ang = Math.acos(clamp(to.dot(d), -1, 1));
      const tol = bd + 0.5 / Math.max(dist, 1);
      if (ang < tol && ang < bd + 0.3) { best = e; bd = ang; }
    }
    if (best && best.pos.distanceTo(this.pos) < 40) { a.enemy = best; a.valid = true; a.kind = 'enemy'; a.point.copy(best.chest(_v)); return; }
    const hit = g.city.raycast(o, d, 160, _hit);
    if (!hit) return;
    if (hit.box && hit.box.kind === 'hive' && hit.box.hive.solid && hit.t < 60) {
      a.enemy = g.hiveTarget(hit.box.hive); a.valid = true; a.kind = 'enemy'; a.point.copy(hit.point); return;
    }
    if (hit.point.distanceTo(this.pos) < 4) return;
    a.point.copy(hit.point); a.normal.copy(hit.normal); a.box = hit.box;
    if (hit.box && Math.abs(hit.normal.y) < 0.5) {
      a.kind = hit.box.y1 - hit.point.y < 12 ? 'perch' : 'wall';
      if (a.kind === 'perch') a.point.set(hit.point.x, hit.box.y1, hit.point.z);
    } else a.kind = 'ground';
    a.valid = true;
  }

  handleInput(dt) {
    const g = this.game, inp = g.input;
    if (inp.pressed('suit')) this.toggleSuit();
    if (inp.pressed('heal')) this.heal();

    const busy = this.act && !this.act.dodge;
    // --- traversal ---
    if (inp.pressed('jump')) {
      if (this.state === 'ground' && !busy) { this.charging = true; this.charge = 0; }
      else if (this.state === 'swing') this.releaseSwing(true);
      else if (this.state === 'wall') this.wallJump();
      else if (this.state === 'perch') this.launchFromPerch();
      else if (this.state === 'zip' && this.zip.kind === 'perch' && this.zip.t / this.zip.dur > 0.6) { this.zip.launch = true; }
    }
    if (this.charging) {
      this.charge = Math.min(1, this.charge + dt / 0.45);
      if (inp.released('jump') || !inp.held('jump') || this.charge >= 1) {
        this.charging = false;
        if (this.state === 'ground') this.jump(lerp(12.5, 27, this.charge * this.charge));
      }
      if (this.state !== 'ground') this.charging = false;
    }

    if (inp.held('swing') && this.swingCd <= 0 && !busy) {
      if (this.state === 'air' && this.pos.y - this.groundBelow() > 4.5) this.tryAttach();
      else if (this.state === 'wall' && inp.pressed('swing')) this.wallJump();
      else if (this.state === 'perch' && inp.pressed('swing')) this.launchFromPerch();
    }
    if (this.state === 'swing' && !inp.held('swing')) this.releaseSwing(false);

    if (inp.pressed('zip')) {
      if (this.aim.enemy) this.webStrike(this.aim.enemy);
      else if (this.aim.valid && !busy) this.startZip();
    }
    if (inp.pressed('dash')) this.airDash();
    if (inp.pressed('dodge')) this.dodge();

    // --- combat ---
    if (inp.pressed('attack')) {
      if (this.act && !this.act.dodge) this.queued = true;
      else if (!this.act) { this.attack(); this.launchTried = false; }
    }
    // hold strike = launcher: the opening jab turns into an uppercut (the jab itself is over before a hold reads as one)
    const a0 = this.act;
    if (inp.held('attack') && inp.holdTime('attack') > 0.22 && this.state === 'ground' && !this.launchTried && this.lastAttack < 0.5 &&
      (!a0 || (a0.chainIndex === 0 && !a0.dodge))) {
      this.launchTried = true;
      const t = (a0 && a0.target) || this.pickTarget(4);
      if (t && t.canLaunch && t.alive) { this.queued = false; this.startAction('upper', t); }
    }
    if (inp.pressed('web')) { this.webHold = 0; this.webYanked = false; }
    if (inp.held('web')) {
      this.webHold += dt;
      if (this.webHold > 0.24 && !this.webYanked && !busy) { this.webYanked = true; this.yank(); }
    }
    if (inp.released('web') && !this.webYanked && this.webHold < 0.24 && !busy) this.webShot();

    if (inp.pressed('finisher')) this.finisher();
    if (inp.pressed('bomb')) { if (this.black) this.surge(); else this.webBomb(); }
  }

  groundBelow() { return this.game.city.groundAt(this.pos.x, this.pos.z, this.pos.y); }

  // -------------------------------------------------------------------------
  stepGround(dt) {
    const g = this.game;
    const sprint = g.input.held('swing');
    const mvl = Math.min(1, Math.hypot(this.mv.x, this.mv.y));
    let wx = 0, wz = 0;
    if (this.act && this.act.lunge) { wx = this.act.lunge.x; wz = this.act.lunge.z; }
    else if (!this.act && !this.charging && this.landT < 0.25 && this.hurtT <= 0) {
      const sp = sprint ? SPRINT : RUN;
      wx = this.moveDir.x * sp; wz = this.moveDir.z * sp;
      if (mvl > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(this.moveDir.x, this.moveDir.z), sprint ? 9 : 14, dt);
    }
    const acc = this.act ? 40 : (mvl > 0.1 ? 60 : 45);
    const dx = wx - this.vel.x, dz = wz - this.vel.z;
    const dl = Math.hypot(dx, dz), mx = acc * dt;
    if (dl > mx) { this.vel.x += (dx / dl) * mx; this.vel.z += (dz / dl) * mx; } else { this.vel.x = wx; this.vel.z = wz; }
    this.vel.y = 0;
    this.pos.addScaledVector(this.vel, dt);
    // walls
    const c = _v.copy(this.pos); c.y += 0.9;
    if (g.city.collide(c, 0.42, _n)) {
      this.pos.copy(c); this.pos.y -= 0.9;
      if (Math.abs(_n.y) < 0.35) {
        const into = this.vel.dot(_n);
        if (into < 0) this.vel.addScaledVector(_n, -into);
        if (!this.act && mvl > 0.3 && this.moveDir.dot(_n) < -0.55) this.wallPush += dt; else this.wallPush = 0;
        if (this.wallPush > 0.12) { this.wallPush = 0; if (this.enterWall(_n, 4)) return; }
      }
    } else this.wallPush = 0;
    const gy = g.city.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y - gy > 0.65) { this.state = 'air'; this.stateT = 0; return; }
    this.pos.y = gy;
  }

  jump(v) {
    this.stats.jumps++;
    this.state = 'air'; this.stateT = 0;
    this.vel.y = v;
    const big = v > 18;
    if (big) {
      this.game.fx.ring(this.pos, 4, 0.4);
      this.game.fx.add.emit(this.pos, 20, { speed: 6, color: [0.6, 0.55, 0.5], life: 0.6, size: 0.3, gravity: 2 });
      this.game.audio.whoosh(true);
      this.game.cam.shake(0.15);
      this.game.rumble(0.3, 0.3, 120);
    }
  }

  stepAir(dt) {
    const g = this.game;
    const juggling = this.act && this.act.air;
    if (juggling) { this.vel.y -= G * 0.18 * dt; this.vel.y = Math.max(this.vel.y, -3); this.vel.x *= 1 - 4 * dt; this.vel.z *= 1 - 4 * dt; }
    else if (!this.act || !this.act.zip) this.vel.y -= G * dt;
    // air control preserves momentum but lets you steer
    if (!this.act && this.moveDir.lengthSq() > 0.01) {
      const hs = Math.hypot(this.vel.x, this.vel.z);
      this.vel.x += this.moveDir.x * 14 * dt; this.vel.z += this.moveDir.z * 14 * dt;
      const nhs = Math.hypot(this.vel.x, this.vel.z), cap = Math.max(hs, 9);
      if (nhs > cap) { this.vel.x *= cap / nhs; this.vel.z *= cap / nhs; }
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 1) {
      const drag = 1 - Math.min(0.5, 0.0009 * hs * dt * 60);
      this.vel.x *= drag; this.vel.z *= drag;
      if (!this.act) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 5, dt);
    }
    this.vel.y = Math.max(this.vel.y, -62);
    if (!this.act) this.streetAssist(dt, 0.6);
    if (this.act && this.act.lunge) { this.pos.addScaledVector(this.act.lunge, dt); }
    this.pos.addScaledVector(this.vel, dt);
    const c = _v.copy(this.pos); c.y += 0.9;
    if (g.city.collide(c, 0.42, _n)) {
      this.pos.copy(c); this.pos.y -= 0.9;
      if (Math.abs(_n.y) < 0.35) {
        if (this.wallCd <= 0 && !this.act && this.enterWall(_n, 1.6)) return;
        const into = this.vel.dot(_n);
        if (into < 0) this.vel.addScaledVector(_n, -into * 1.0);
      } else if (_n.y < -0.5 && this.vel.y > 0) this.vel.y = 0;
    }
    const gy = g.city.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= gy && this.vel.y <= 0) { this.pos.y = gy; this.land(); }
  }

  land() {
    const vy = this.vel.y;
    const g = this.game;
    this.state = 'ground'; this.stateT = 0;
    this.vel.y = 0;
    this.airDashes = 0;
    this.airAttacks = 0;
    if (this.act && this.act.air) this.endAction();
    if (vy < -30) {
      this.landT = 0.6; this.landK = 1;
      this.vel.x *= 0.15; this.vel.z *= 0.15;
      g.fx.ring(this.pos, 7, 0.5);
      g.fx.add.emit(this.pos, 40, { speed: 9, color: [0.5, 0.45, 0.42], life: 0.8, size: 0.35, gravity: 3, up: 2 });
      g.cam.shake(0.45);
      g.audio.land(true);
      g.rumble(0.85, 0.5, 220);
      // shockwave knocks nearby thugs off their feet
      for (const e of g.enemies) if (e.targetable && e.pos.distanceTo(this.pos) < 5) e.takeHit({ dmg: 6, knock: true, kb: 6, up: 3 }, _v.copy(e.pos).sub(this.pos).setY(0).normalize(), this);
    } else if (vy < -14) {
      this.landT = 0.22; this.landK = 0.45;
      this.vel.x *= 0.75; this.vel.z *= 0.75;
      g.audio.land(false);
      g.rumble(0.15, 0.25, 70);
    }
  }

  // -------------------------------------------------------------------------
  // Pick a web anchor: an ideal point ahead & above, snapped onto the best nearby building face.
  tryAttach() {
    const g = this.game, city = g.city;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const camF = g.cam.forwardH(_v3);
    const f = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    if (hs > 4) f.divideScalar(hs); else f.copy(camF);
    f.lerp(camF, this.mv.y > 0.2 ? 0.6 : 0.3).normalize();
    if (this.moveDir.lengthSq() > 0.04) f.lerp(this.moveDir, 0.7).normalize();
    const o = _v.copy(this.pos); o.y += HAND_Y;
    const gy = this.groundBelow();
    const D = clamp(13 + hs * 0.3, 13, 26);
    const H = clamp(19 + hs * 0.12, 18, 28);
    const ix = o.x + f.x * D, iz = o.z + f.z * D;
    const boxes = city.boxesNear(ix, iz, 46, this._near || (this._near = []));
    let best = null, bs = -1e9;
    const cp = new THREE.Vector3(), to = new THREE.Vector3();
    for (const b of boxes) {
      if (b.kind !== 'bld' && b.kind !== 'bridge') continue;
      if (b.y1 < o.y + 6) continue;
      const ay = Math.min(o.y + H, b.y1 - 0.4);
      // closest point on the box's vertical faces to the ideal point
      let x = clamp(ix, b.x0, b.x1), z = clamp(iz, b.z0, b.z1);
      if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) {
        const dx0 = x - b.x0, dx1 = b.x1 - x, dz0 = z - b.z0, dz1 = b.z1 - z;
        const m = Math.min(dx0, dx1, dz0, dz1);
        if (m === dx0) x = b.x0; else if (m === dx1) x = b.x1; else if (m === dz0) z = b.z0; else z = b.z1;
      }
      cp.set(x, ay, z);
      to.copy(cp).sub(o);
      const dist = to.length();
      if (dist < 10 || dist > 72) continue;
      const hl = Math.hypot(to.x, to.z) || 1;
      const fwd = (to.x * f.x + to.z * f.z) / hl;
      if (fwd < 0.15) continue;
      const off = Math.hypot(x - ix, z - iz);
      const s = fwd * 2.2 - off / 22 - Math.abs(ay - o.y - H) / 25 - Math.abs(dist - 30) / 60;
      if (s > bs) { bs = s; best = { p: cp.clone(), b }; }
    }
    if (!best) { this.swingCd = 0.1; return false; }
    // make sure the web isn't passing through another building
    to.copy(best.p).sub(o);
    const dist = to.length();
    const hit = city.raycast(o, to.divideScalar(dist), dist + 0.5, _hit);
    if (hit && hit.t < dist - 1.0) {
      if (!hit.box || hit.point.y < o.y + 5 || hit.t < 9) { this.swingCd = 0.1; return false; }
      best.p.copy(hit.point);
    }
    const s = this.swing;
    s.attach = (s.attach || new THREE.Vector3()).copy(best.p);
    // physics pivot sits between the wall and your line of travel, so swings flow down the street
    s.anchor.copy(best.p);
    const rx = best.p.x - o.x, rz = best.p.z - o.z;
    const along = rx * f.x + rz * f.z;
    const lx = rx - f.x * along, lz = rz - f.z * along;
    s.anchor.x -= lx * 0.65; s.anchor.z -= lz * 0.65;
    s.len = s.anchor.distanceTo(o);
    s.min = Math.max(9, s.len * 0.8);
    if (s.anchor.y - s.min < gy + 3) s.min = Math.max(6, s.anchor.y - gy - 3);
    s.len = Math.max(s.len, s.min);
    s.t = 0;
    this.state = 'swing'; this.stateT = 0;
    this.airDashes = 0; this.airAttacks = 0;
    this.act = null;
    g.audio.thwip(this.black);
    g.rumble(0, 0.22, 50);
    g.fx.hitSpark(s.attach, false, this.black);
    const n = _v2.copy(s.anchor).sub(o).normalize();
    this.vel.addScaledVector(n, 2.5);
    return true;
  }

  // Insomniac-style street assist: when racing along an avenue/street without lateral input, ease toward its centre line.
  streetAssist(dt, k = 1) {
    if (Math.abs(this.mv.x) > 0.3) return;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs < 12) return;
    const p = this.pos;
    if (p.x < L.X0 || p.x > -L.X0 || p.z < L.Z0 || p.z > -L.Z0) return;
    if (Math.abs(this.vel.z) > Math.abs(this.vel.x) * 2) {
      const a = Math.round((p.x - L.X0 - L.AVE / 2) / L.PX);
      const cx = L.X0 + a * L.PX + L.AVE / 2;
      if (Math.abs(cx - p.x) < L.PX * 0.45) this.vel.x += ((cx - p.x) * 1.4 - this.vel.x * 1.6) * dt * k;
    } else if (Math.abs(this.vel.x) > Math.abs(this.vel.z) * 2) {
      const j = Math.round((p.z - L.Z0 - L.ST / 2) / L.PZ);
      const cz = L.Z0 + j * L.PZ + L.ST / 2;
      if (Math.abs(cz - p.z) < L.PZ * 0.45) this.vel.z += ((cz - p.z) * 1.4 - this.vel.z * 1.6) * dt * k;
    }
  }

  stepSwing(dt) {
    const g = this.game, s = this.swing;
    s.t += dt;
    this.streetAssist(dt, 1);
    this.vel.y -= G * dt;
    const c = _v.copy(this.pos); c.y += HAND_Y;
    const n = _n.copy(s.anchor).sub(c);
    const dist = n.length();
    n.divideScalar(dist);
    // steering: tangential component of the desired move direction
    if (this.moveDir.lengthSq() > 0.01) {
      const md = _v2.copy(this.moveDir);
      md.addScaledVector(n, -md.dot(n));
      this.vel.addScaledVector(md, 13 * dt);
    }
    // pumping through the bottom of the arc drives you forward, not up
    if (c.y < s.anchor.y - s.len * 0.55) {
      const hv = _v2.set(this.vel.x, 0, this.vel.z);
      const hl = hv.length();
      if (hl > 1) {
        hv.divideScalar(hl);
        if (this.moveDir.lengthSq() > 0.04) hv.lerp(this.moveDir, 0.5).normalize();
        this.vel.addScaledVector(hv, (hl < 40 ? 11 : 4) * dt);
      }
    }
    s.len = Math.max(s.min, s.len - 2 * dt);
    const sp = this.vel.length();
    if (sp > 58) this.vel.multiplyScalar(58 / sp);
    this.pos.addScaledVector(this.vel, dt);
    // inextensible rope
    c.copy(this.pos); c.y += HAND_Y;
    const d = _v2.copy(c).sub(s.anchor);
    const dl = d.length();
    if (dl > s.len) {
      d.divideScalar(dl);
      c.copy(s.anchor).addScaledVector(d, s.len);
      this.pos.copy(c); this.pos.y -= HAND_Y;
      const vr = this.vel.dot(d);
      if (vr > 0) this.vel.addScaledVector(d, -vr);
    }
    if (sp > 2) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 6, dt);
    // collisions
    const cc = _v3.copy(this.pos); cc.y += 0.9;
    if (g.city.collide(cc, 0.42, _n)) {
      this.pos.copy(cc); this.pos.y -= 0.9;
      if (Math.abs(_n.y) < 0.35) { if (this.enterWall(_n, 1.6)) { g.fx.swingLine.mesh.visible = false; return; } }
      const into = this.vel.dot(_n);
      if (into < 0) this.vel.addScaledVector(_n, -into);
    }
    const gy = g.city.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= gy) { this.pos.y = gy; this.vel.y = Math.max(0, this.vel.y); g.fx.swingLine.mesh.visible = false; this.land(); return; }
    // let go automatically near the top of the arc so you fly forward
    const rel = _v2.copy(this.pos).setY(this.pos.y + HAND_Y).sub(s.anchor);
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (rel.y > -s.len * 0.42 && this.vel.y > 0 && hv > 3 && rel.x * this.vel.x + rel.z * this.vel.z > 0) this.releaseSwing(false, true);
    else if (s.t > 4.5) this.releaseSwing(false);
  }

  releaseSwing(jump, auto = false) {
    const g = this.game;
    this.state = 'air'; this.stateT = 0;
    this.swingCd = auto ? 0.22 : 0.15;
    g.fx.swingLine.mesh.visible = false;
    const sp = this.vel.length();
    if (jump) {
      const hv = _v.set(this.vel.x, 0, this.vel.z);
      const hl = hv.length();
      if (hl > 0.1) this.vel.addScaledVector(hv.divideScalar(hl), 5);
      this.vel.y = Math.max(this.vel.y, 3) + 11;
      this.flip(['flip', 'roll', 'rollL'][Math.floor(Math.random() * 3)]);
      g.audio.whoosh(true);
    } else if (this.vel.y > 0) {
      const hv = _v.set(this.vel.x, 0, this.vel.z);
      const hl = hv.length();
      // convert surplus climb into forward momentum so the line flattens out
      const excess = Math.max(0, this.vel.y - 11);
      if (hl > 0.1) this.vel.addScaledVector(hv.divideScalar(hl), 4 + excess * 0.6);
      this.vel.y = Math.min(this.vel.y + 1.5, 12);
      if (sp > 24 && Math.random() < 0.55) this.flip(Math.random() < 0.6 ? 'flip' : Math.random() < 0.5 ? 'roll' : 'rollL');
      g.audio.whoosh(false);
    }
  }

  flip(name) { this.flipName = name; this.flipT = DUR[name] || 0.5; }

  // -------------------------------------------------------------------------
  enterWall(n, minAbove) {
    const g = this.game;
    const an = new THREE.Vector3(n.x, 0, n.z);
    if (Math.abs(an.x) > Math.abs(an.z)) an.set(Math.sign(an.x), 0, 0); else an.set(0, 0, Math.sign(an.z));
    const box = g.city.wallAt(_v.copy(this.pos).setY(this.pos.y + 0.9), an, 0.8);
    if (!box || box.kind === 'hive' || box.y1 - this.pos.y < minAbove) return false;
    // reject faces that are buried against a neighbouring building
    const test = _v3.copy(this.pos);
    const R = 0.42;
    if (an.x > 0.5) test.x = box.x1 + R; else if (an.x < -0.5) test.x = box.x0 - R; else if (an.z > 0.5) test.z = box.z1 + R; else test.z = box.z0 - R;
    test.y += 0.9;
    if (g.city.pointInBox(test, 0.05)) return false;
    const w = this.wall;
    w.n.copy(an); w.box = box;
    const sp = this.vel.length();
    w.mom = clamp(this.vel.y * 0.6 + sp * 0.35, 0, 16);
    this.vel.set(0, 0, 0);
    this.state = 'wall'; this.stateT = 0;
    this.yaw = Math.atan2(-an.x, -an.z);
    this.airDashes = 0;
    if (this.act && !this.act.dodge) this.endAction();
    this.snapToWall();
    g.audio.land(false);
    return true;
  }

  snapToWall() {
    const w = this.wall, b = w.box, R = 0.42;
    if (w.n.x > 0.5) this.pos.x = b.x1 + R; else if (w.n.x < -0.5) this.pos.x = b.x0 - R;
    else if (w.n.z > 0.5) this.pos.z = b.z1 + R; else this.pos.z = b.z0 - R;
  }

  stepWall(dt) {
    const g = this.game, w = this.wall, inp = g.input;
    const n = w.n;
    const t = _v.set(n.z, 0, -n.x); // character's right while facing the wall
    const camR = g.cam.rightH(_v2);
    const lat = this.mv.x * (camR.dot(t) >= 0 ? 1 : -1);
    const sp = inp.held('swing') ? 15 : 9.5;
    const vy = this.mv.y * sp + w.mom;
    w.mom *= Math.exp(-2.2 * dt);
    this.vel.set(t.x * lat * sp, vy, t.z * lat * sp);
    this.pos.addScaledVector(this.vel, dt);
    const moving = Math.min(1, Math.hypot(this.mv.x, this.mv.y) + w.mom / 8);
    w.phase += dt * (6 + moving * 8) * moving;
    // corners & neighbouring buildings
    const b = w.box;
    const alongX = Math.abs(n.z) > 0.5;
    const lo = alongX ? b.x0 : b.z0, hi = alongX ? b.x1 : b.z1;
    const coord = alongX ? this.pos.x : this.pos.z;
    if (coord < lo - 0.05 || coord > hi + 0.05) {
      const nb = g.city.wallAt(_v3.copy(this.pos).setY(this.pos.y), n, 0.8);
      if (nb && nb !== b && nb.y1 - this.pos.y > 1) { w.box = nb; }
      else {
        // wrap round the corner onto the side face — unless another building is flush against it
        const side = coord > hi ? 1 : -1;
        const cand = _v3.copy(this.pos);
        if (alongX) cand.x = side > 0 ? b.x1 + 0.42 : b.x0 - 0.42; else cand.z = side > 0 ? b.z1 + 0.42 : b.z0 - 0.42;
        if (alongX) cand.z = n.z > 0 ? b.z1 - 0.3 : b.z0 + 0.3; else cand.x = n.x > 0 ? b.x1 - 0.3 : b.x0 + 0.3;
        cand.y += 0.9;
        if (g.city.pointInBox(cand, 0.05)) {
          if (alongX) this.pos.x = clamp(this.pos.x, lo, hi); else this.pos.z = clamp(this.pos.z, lo, hi);
        } else {
          cand.y -= 0.9;
          this.pos.copy(cand);
          n.copy(alongX ? new THREE.Vector3(side, 0, 0) : new THREE.Vector3(0, 0, side));
          this.yaw = Math.atan2(-n.x, -n.z);
        }
      }
    }
    this.snapToWall();
    // safety net: never crawl inside geometry
    if (g.city.pointInBox(_v3.copy(this.pos).setY(this.pos.y + 0.9), 0.05)) {
      this.state = 'air'; this.stateT = 0;
      this.pos.addScaledVector(n, 0.6);
      this.vel.set(n.x * 4, 0, n.z * 4);
      this.wallCd = 0.4;
      return;
    }
    // reached the top: vault onto the roof
    if (this.pos.y + 1.1 >= w.box.y1 && vy > 0) {
      this.state = 'air'; this.stateT = 0;
      this.pos.y = Math.max(this.pos.y, w.box.y1 - 0.8);
      this.vel.set(-n.x * 6, 9.5, -n.z * 6);
      this.wallCd = 0.4;
      this.flip('flip');
      return;
    }
    if (this.pos.y < w.box.y0 + 0.02) this.pos.y = w.box.y0 + 0.02;
    const gy = g.city.groundAt(this.pos.x + n.x * 0.5, this.pos.z + n.z * 0.5, this.pos.y);
    if (this.pos.y - gy < 0.15 && vy < 0) {
      this.state = 'ground'; this.stateT = 0;
      this.pos.addScaledVector(n, 0.25); this.pos.y = gy;
      this.yaw = Math.atan2(n.x, n.z);
    }
  }

  wallJump() {
    const g = this.game, n = this.wall.n;
    const f = g.cam.forwardH(_v);
    this.state = 'air'; this.stateT = 0;
    this.vel.set(n.x * 12 + f.x * 4, 10.5, n.z * 12 + f.z * 4);
    this.wallCd = 0.35;
    this.yaw = Math.atan2(this.vel.x, this.vel.z);
    this.flip('flip');
    g.audio.whoosh(false);
  }

  // -------------------------------------------------------------------------
  startZip() {
    const g = this.game, a = this.aim, z = this.zip;
    z.kind = a.kind;
    z.from.copy(this.pos);
    z.point.copy(a.point);
    z.n.copy(a.normal);
    z.box = a.box;
    z.launch = false;
    if (a.kind === 'perch') {
      const n = new THREE.Vector3(a.normal.x, 0, a.normal.z).normalize();
      z.to.copy(a.point).addScaledVector(n, -0.55);
      z.n.copy(n);
    } else if (a.kind === 'wall') {
      z.to.copy(a.point).addScaledVector(a.normal, 0.45); z.to.y -= 1.0;
    } else z.to.copy(a.point);
    const dist = z.to.distanceTo(z.from);
    z.dur = clamp(dist / 52, 0.2, 2.6);
    z.t = 0;
    this.state = 'zip'; this.stateT = 0;
    this.stats.zips++;
    this.act = null;
    this.yaw = Math.atan2(z.to.x - this.pos.x, z.to.z - this.pos.z);
    g.audio.thwip(this.black);
    g.fx.splat(a.point, a.normal, 0.7);
  }

  stepZip(dt) {
    const g = this.game, z = this.zip;
    z.t += dt;
    const k = Math.min(1, z.t / z.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const prev = _v.copy(this.pos);
    this.pos.lerpVectors(z.from, z.to, e);
    this.pos.y += Math.sin(k * Math.PI) * Math.min(4, z.from.distanceTo(z.to) * 0.05);
    this.vel.copy(this.pos).sub(prev).divideScalar(Math.max(dt, 1e-4));
    if (k < 0.95) {
      const c = _v2.copy(this.pos); c.y += 0.9;
      if (g.city.collide(c, 0.38, _n) && Math.abs(_n.y) < 0.35 && this.enterWall(_n, 1.2)) return;
    }
    if (k >= 1) {
      if (z.kind === 'perch') {
        this.state = 'perch'; this.stateT = 0;
        this.perchDir.copy(z.n);
        this.yaw = Math.atan2(z.n.x, z.n.z);
        this.vel.set(0, 0, 0);
        g.audio.land(false);
        if (z.launch || g.input.held('jump')) this.launchFromPerch();
      } else if (z.kind === 'wall' && z.box) {
        if (!this.enterWall(z.n, 0.5)) { this.state = 'air'; this.vel.multiplyScalar(0.2); }
      } else {
        this.state = 'air'; this.vel.multiplyScalar(0.25);
      }
    }
  }

  launchFromPerch() {
    const g = this.game;
    const f = this.state === 'perch' ? this.perchDir : g.cam.forwardH(_v);
    const cf = g.cam.forwardH(_v2);
    const dir = _v3.copy(f).lerp(cf, 0.5).setY(0).normalize();
    this.state = 'air'; this.stateT = 0;
    this.vel.set(dir.x * 24, 17, dir.z * 24);
    this.yaw = Math.atan2(dir.x, dir.z);
    this.flip('flip');
    this.swingCd = 0.35;
    g.audio.whoosh(true);
    g.fx.add.emit(this.pos, 16, { speed: 5, color: [2, 2, 2.2], life: 0.4, size: 0.12 });
  }

  airDash() {
    const g = this.game;
    if (this.dashCd > 0 || this.airDashes >= 3) return;
    if (this.state === 'swing') this.releaseSwing(false);
    if (this.state !== 'air') return;
    const f = g.cam.forward(_v);
    f.y = clamp(f.y + 0.12, -0.35, 0.55);
    f.normalize();
    const sp = Math.max(32, this.vel.length() * 0.95);
    this.vel.copy(f).multiplyScalar(sp);
    this.airDashes++;
    this.dashCd = 0.42;
    this.dashT = 0.32;
    this.yaw = Math.atan2(f.x, f.z);
    const hand = this.char.handWorld('R', _v2);
    g.fx.webLine(hand, _v3.copy(hand).addScaledVector(f, 26).setY(hand.y + 6), 0.22, 0.02);
    g.audio.thwip(this.black);
  }

  // -------------------------------------------------------------------------
  pickTarget(range, preferAim = true) {
    const g = this.game;
    if (this.lock && this.lock.targetable && this.lock.pos.distanceTo(this.pos) < range * 1.6) return this.lock;
    const dir = this.moveDir.lengthSq() > 0.04 ? _v.copy(this.moveDir).normalize() : g.cam.forwardH(_v);
    let best = null, bs = Infinity;
    if (preferAim && this.aim.enemy && this.aim.enemy.pos.distanceTo(this.pos) < range * 1.4) return this.aim.enemy;
    for (const e of g.enemies) {
      if (!e.targetable) continue;
      const to = _v2.copy(e.pos).sub(this.pos);
      const dy = Math.abs(to.y);
      to.y = 0;
      const d = to.length();
      if (d > range || dy > range * 0.7) continue;
      const ang = d > 0.1 ? Math.acos(clamp(to.divideScalar(d).dot(dir), -1, 1)) : 0;
      const s = d + dy * 0.5 + ang * 3.5 - (e === this.target ? 2.5 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    if (!best) {
      for (const h of g.city.hives) {
        if (!h.solid) continue;
        const d = h.pos.distanceTo(this.pos) - 4;
        if (d < range && d < bs) { bs = d; best = g.hiveTarget(h); }
      }
    }
    return best;
  }

  attack() {
    const air = this.state === 'air' || this.state === 'swing' || this.state === 'wall' || this.state === 'zip' || this.state === 'perch';
    let t = this.pickTarget(air ? 18 : 14);
    if (this.state === 'swing') this.releaseSwing(false);
    if (this.state === 'wall' || this.state === 'perch' || this.state === 'zip') { this.state = 'air'; this.vel.set(0, 2, 0); }
    if (this.state === 'air' && t && t.pos.y < this.pos.y - 5 && !t.airborne) {
      return this.startAction('slam', t, { dive: true });
    }
    if (this.counterT > 0 && t) { this.counterT = 0; return this.startAction('counter', t); }
    let names;
    const idx = this.chain % 4;
    if (idx === 0) this.string = COMBOS[Math.floor(Math.random() * COMBOS.length)];
    if (this.state === 'air') names = ['airA', 'airB', 'airA', 'airC'];
    else names = this.black ? ['tendrilA', 'tendrilB', 'tendrilA', 'tendrilC'] : (this.string || COMBOS[0]);
    this.lastAttack = 0;
    this.chain++;
    this.startAction(names[idx], t, { chainIndex: idx });
  }

  startAction(name, target, o = {}) {
    const g = this.game;
    const dur = (DUR[name] || 0.4) * (this.black && HIT[name] ? 1.12 : 1);
    const air = this.state === 'air';
    const prevZip = this.act && this.act.zip;
    // hang time only while juggling someone who's actually airborne, and it runs out
    const juggle = air && name !== 'slam' && target && target.airborne && this.airAttacks < 6;
    if (air) this.airAttacks++;
    this.act = { name, t: 0, dur, hit: ACT[name]?.hit ?? 0.5, target, done: false, air: !!juggle, chainIndex: o.chainIndex ?? -1, lunge: null, ...o };
    this.queued = false;
    this.target = target && target.isHive ? null : target;
    if (target) {
      const tp = target.pos;
      this.yaw = Math.atan2(tp.x - this.pos.x, tp.z - this.pos.z);
      const d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z) - (target.radius || 0.5);
      const dy = tp.y - this.pos.y;
      // zip across the gap to distant targets (the signature air-combat move)
      if ((d > 6 || Math.abs(dy) > 3.5) && d < 30 && !o.dive && name !== 'finisher') {
        this.act.zip = true; this.act.zipT = 0;
        if (!prevZip) g.audio.thwip(this.black);
        if (this.state === 'ground') { this.state = 'air'; this.pos.y += 0.1; }
      }
    }
    if (name === 'slam') { this.vel.set(0, 6, 0); }
    if (this.act.air && !this.act.zip) this.vel.y = Math.max(this.vel.y, 2.5);
    if (!this.act.zip) g.audio.whoosh(HIT[name]?.heavy);
  }

  updateAction(dt) {
    const g = this.game, a = this.act;
    const tgt = a.target;
    if (tgt && !tgt.alive) a.target = null;
    if (a.zip) {
      a.zipT += dt;
      const tp = a.target ? a.target.chest(_v2) : null;
      if (!tp || a.zipT > 1.0) { a.zip = false; }
      else {
        const to = _v.copy(tp).sub(this.chestPos(_v3));
        const d = to.length();
        if (d < 2.0) { a.zip = false; this.vel.set(0, a.air || this.state === 'air' ? 2 : 0, 0); }
        else {
          to.divideScalar(d);
          this.vel.copy(to).multiplyScalar(Math.min(42, d / dt));
          this.yaw = Math.atan2(to.x, to.z);
          const hand = this.char.handWorld('R', _v3);
          g.fx.webLine(hand, tp, 0.05, 0.022);
          if (this.state === 'ground') this.state = 'air';
          return;
        }
      }
    }
    a.t += dt;
    const k = a.t / a.dur;
    // lunge toward the target until the hit lands
    a.lunge = null;
    if (a.target && !a.dodge && k < a.hit) {
      const to = _v.copy(a.target.pos).sub(this.pos); to.y = 0;
      const d = to.length() - (a.target.radius || 0.5);
      if (d > 1.1) {
        const remain = Math.max(0.05, (a.hit - k) * a.dur);
        const sp = Math.min(16, (d - 1.0) / remain);
        a.lunge = to.normalize().multiplyScalar(sp);
      }
      this.yaw = dampAngle(this.yaw, Math.atan2(a.target.pos.x - this.pos.x, a.target.pos.z - this.pos.z), 20, dt);
    }
    if (a.dodge) a.lunge = null;
    if (a.dive && k < a.hit) {
      // plunge onto targets below
      const tp = a.target ? a.target.pos : this.pos;
      const to = _v.copy(tp).sub(this.pos);
      if (k > 0.25) { this.vel.set(to.x * 3, -38, to.z * 3); }
    }
    if (!a.done && k >= a.hit && HIT[a.name] !== undefined) { a.done = true; this.resolveHit(a); }
    if (!a.done && k >= a.hit && a.onHit) { a.done = true; a.onHit(a); }
    if (a.name === 'yank' && a.target && k > 0.2 && !a.pulled) { a.pulled = true; this.doYankPull(a); }
    if (a.name === 'yank' && a.target && k < 0.75) {
      const hand = this.char.handWorld('R', _v3);
      if (this.black) { if (!a.tendril) a.tendril = g.fx.tendril(this.backPos(_v), a.target.chest(_v2), 0.4); else a.tendril.target.copy(a.target.chest(_v2)); }
      else g.fx.webLine(hand, a.target.chest(_v2), 0.05, 0.02);
    }
    if (this.queued && k >= 0.55 && !a.dodge) { this.endAction(); this.attack(); return; }
    if (k >= 1) this.endAction();
  }

  endAction() {
    const a = this.act;
    this.act = null;
    if (a && ['spin', 'airC', 'counter', 'finisher', 'dodge', 'roll', 'rollL', 'flip'].includes(a.name)) {
      const e = this.char.j.pivot.userData.e;
      if (e) this.char.snapPivot(...e.map((v) => Math.atan2(Math.sin(v), Math.cos(v))));
    }
    if (a && a.slowmo) this.game.cam.cine = 0;
    this.chainT = 0.55;
  }

  backPos(out) {
    return this.char.j.chest.localToWorld(out.set(0, 0.2, -0.15));
  }

  resolveHit(a) {
    const g = this.game, spec = HIT[a.name];
    if (!spec) return;
    const black = this.black || spec.black;
    const aoe = spec.aoe || (this.black ? 3.2 : 0);
    const facing = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const targets = new Set();
    if (a.target && a.target.alive) {
      const d = a.target.pos.distanceTo(this.pos) - (a.target.radius || 0.5);
      if (d < spec.reach + 1.2) targets.add(a.target);
    }
    if (aoe) {
      for (const e of g.enemies) {
        if (!e.targetable) continue;
        const to = _v2.copy(e.pos).sub(this.pos);
        const dy = to.y; to.y = 0;
        const d = to.length();
        if (d > aoe + (e.radius || 0.5) || Math.abs(dy) > 3) continue;
        if (spec.cone !== undefined && d > 0.5 && to.normalize().dot(facing) < spec.cone) continue;
        targets.add(e);
      }
    }
    let landed = 0;
    const mult = this.dmgMult;
    for (const e of targets) {
      const dir = _v3.copy(e.pos).sub(this.pos).setY(0);
      if (dir.lengthSq() < 1e-4) dir.copy(facing); else dir.normalize();
      const s = { ...spec, dmg: spec.dmg * mult, black };
      if (this.black) { s.kb = (s.kb || 2) * 1.35; }
      if (e.takeHit(s, dir, this)) {
        landed++;
        const c = e.chest(_v2);
        g.fx.hitSpark(c, spec.heavy, black);
        if (black) g.fx.tendril(this.backPos(_v), c, 0.18);
      }
    }
    if (landed) {
      if (a.name === 'upper') this.stats.launches++;
      if (a.name === 'webStrike') this.stats.webStrikes++;
      if (this.state === 'air' && a.target && a.target.airborne) this.stats.airHits++;
    }
    if (a.name === 'upper' && landed && a.target && !a.target.isHive) {
      // ride the launcher up with them
      this.state = 'air'; this.vel.set(0, 11.8, 0); this.pos.y += 0.05;
    }
    if (a.name === 'slam' || a.name === 'tendrilC' || a.name === 'spin' || a.name === 'surge') {
      g.fx.ring(this.pos, a.name === 'surge' ? 10 : 5, 0.45, black ? [1.8, 0.6, 3] : undefined);
      if (a.name === 'slam') { g.cam.shake(0.35); g.audio.land(true); }
    }
    if (landed) {
      this.combo += landed;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.comboT = 2.6;
      this.focus = Math.min(3, this.focus + 0.055 * landed * (this.black ? 0.8 : 1.4));
      g.addXp(3 * landed * (1 + Math.floor(this.combo / 10)));
      this.stats.hits += landed;
      // weight of the blow drives the freeze, camera kick and lens punch
      const fin = a.chainIndex === 3 || a.name === 'counter' || a.name === 'finisher';
      const w = fin ? 1.25 : spec.heavy ? 0.9 : spec.launch ? 0.8 : 0.45;
      g.hitstop(0.035 + w * 0.08);
      g.cam.shake(0.08 + w * 0.22);
      g.cam.kick(_v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 0.06 + w * 0.16);
      if (w >= 0.9) g.cam.punch(2 + w * 3);
      g.audio.punch(spec.heavy, black);
      g.rumble(0.12 + w * 0.4, 0.3 + w * 0.4, 50 + w * 90);
      g.hud.comboPulse();
      // the last enemy of a fight goes down in slow motion
      if (fin || spec.heavy) {
        const dead = [...targets].some((e) => !e.alive);
        if (dead && !g.enemies.some((e) => e.alive && e.alerted && e.pos.distanceTo(this.pos) < 30)) g.slowmo(0.25, 0.7);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Lock-on: the camera frames the target and every attack goes to it. Flick the camera to switch.
  toggleLock() {
    if (this.lock) { this.lock = null; this.game.audio.ui(); return true; }
    const t = this.pickTarget(30);
    if (!t || t.isHive) return false;
    this.lock = t;
    this.game.audio.tone({ freq: 880, to: 1320, type: 'triangle', dur: 0.08, gain: 0.06 });
    return true;
  }

  switchLock(side) {
    if (!this.lock) return;
    const g = this.game, right = g.cam.rightH(_v3);
    let best = null, bs = Infinity;
    for (const e of g.enemies) {
      if (!e.targetable || e === this.lock || e.isHive) continue;
      const to = _v.copy(e.pos).sub(this.pos); const d = to.length();
      if (d > 30) continue;
      const lat = to.dot(right) * side; // side +1: the next enemy to the right on screen
      if (lat <= 0.2) continue;
      const sc = d * 0.4 + Math.abs(to.dot(g.cam.forwardH(_v2))) * 0.2 - lat * 0.1;
      if (sc < bs) { bs = sc; best = e; }
    }
    if (best) { this.lock = best; g.audio.tone({ freq: 990, to: 1200, type: 'triangle', dur: 0.06, gain: 0.05 }); }
  }

  updateLock() {
    const l = this.lock;
    if (!l) return;
    if (!l.targetable || l.pos.distanceTo(this.pos) > 38 || this.state === 'dead') {
      // the target went down: hop to the next one close by, or let go
      const next = l.targetable ? null : this.nearestEnemy(18);
      this.lock = next;
    }
  }

  nearestEnemy(range) {
    let best = null, bd = range;
    for (const e of this.game.enemies) {
      if (!e.targetable || e.isHive) continue;
      const d = e.pos.distanceTo(this.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  dodge() {
    const g = this.game;
    if (this.state === 'swing' || this.state === 'wall' || this.state === 'zip' || this.state === 'perch' || this.state === 'dead') return;
    if (this.act && this.act.dodge && this.act.t < this.act.dur * 0.7) return;
    this.stats.dodges++;
    // spider-sense: dodging at the last instant triggers a perfect dodge
    let perfect = null;
    for (const e of g.enemies) if (e.alive && e.threatT >= 0 && e.threatT < 0.36 && e.targetsPlayer) { perfect = e; break; }
    const facing = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const dir = this.moveDir.lengthSq() > 0.04 ? _v2.copy(this.moveDir).normalize() : _v2.copy(facing).negate();
    const fwd = dir.dot(facing), side = dir.x * facing.z - dir.z * facing.x;
    let name = 'dodge';
    if (fwd > 0.5) name = 'flip'; else if (Math.abs(side) > 0.6) name = side > 0 ? 'roll' : 'rollL';
    this.act = { name, t: 0, dur: DUR[name], dodge: true, hit: 2, dir: dir.clone() };
    this.queued = false;
    const air = this.state === 'air';
    this.vel.x = dir.x * (air ? 11 : 14); this.vel.z = dir.z * (air ? 11 : 14);
    if (air) this.vel.y = Math.max(this.vel.y, 5);
    else { this.state = 'air'; this.vel.y = 5.5; }
    this.invuln = 0.4;
    g.audio.whoosh(false);
    if (perfect) {
      perfect.perfectDodged = true;
      this.focus = Math.min(3, this.focus + 0.35);
      this.counterT = 1.6;
      this.invuln = 0.7;
      this.stats.perfect++;
      g.slowmo(0.22, 0.75);
      g.audio.perfect();
      g.rumble(0.25, 0.8, 260);
      g.hud.flashText('PERFECT DODGE', '#9fd8ff');
    }
  }

  webShot() {
    const g = this.game;
    if (this.state === 'dead' || this.state === 'zip') return;
    const t = this.pickTarget(32);
    this.startAction('webShot', null);
    const a = this.act;
    a.onHit = () => {
      const hand = this.char.handWorld('R', _v);
      if (t && t.alive && !t.isHive) {
        const dir = t.chest(_v2).sub(hand).normalize();
        g.fx.shootBlob(hand, dir.multiplyScalar(60), 1.2, (p) => { this.stats.webHits++; t.webHit(1, this); g.fx.add.emit(p, 10, { speed: 4, color: [2, 2, 2.2], life: 0.3, size: 0.1 }); g.audio.punch(false, false); }, () => t.chest(_v3));
      } else if (this.aim.valid) {
        const dir = _v2.copy(this.aim.point).sub(hand);
        const d = dir.length();
        const pt = this.aim.point.clone(), nn = this.aim.normal.clone();
        g.fx.shootBlob(hand, dir.normalize().multiplyScalar(60), d / 60, () => g.fx.splat(pt, nn, 1.0));
      }
      g.audio.thwip(this.black);
    };
    if (t) this.yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
  }

  yank() {
    const g = this.game;
    const t = this.pickTarget(26);
    if (!t || t.isHive) return;
    if (this.state === 'swing') this.releaseSwing(false);
    if (t.heavy && !this.black) return this.webStrike(t);
    this.startAction('yank', t);
    this.act.lunge = null;
    this.act.noLunge = true;
    g.audio.thwip(this.black);
  }

  doYankPull(a) {
    const t = a.target;
    if (!t) return;
    if (this.black) {
      // tendrils lift them and slam them into the street
      t.grabSlam(this);
      a.done = true;
      const c = t.chest(_v2);
      this.game.fx.hitSpark(c, true, true);
      this.combo++; this.comboT = 2.6; this.focus = Math.min(3, this.focus + 0.08);
      this.game.hitstop(0.08); this.game.cam.shake(0.3); this.game.audio.punch(true, true); this.game.rumble(0.6, 0.6, 150);
    } else t.yankTo(this);
  }

  webStrike(t) {
    if (this.state === 'dead') return;
    if (this.state === 'swing') this.releaseSwing(false);
    if (this.state === 'wall' || this.state === 'perch' || this.state === 'zip') { this.state = 'air'; this.vel.set(0, 2, 0); }
    this.startAction('webStrike', t);
    if (this.act && !this.act.zip && t.pos.distanceTo(this.pos) > 3) { this.act.zip = true; this.act.zipT = 0; if (this.state === 'ground') this.state = 'air'; }
  }

  finisher() {
    const g = this.game;
    if (this.focus < 1 || this.state === 'dead' || this.state === 'swing') return;
    const t = this.pickTarget(8);
    if (!t) return;
    if (t.isHive) return;
    if (t.heavy && t.hp > t.maxHp * 0.45) { g.hud.flashText('WEAKEN IT FIRST', '#ffb070'); return; }
    this.focus -= 1;
    if (this.state !== 'ground' && this.state !== 'air') this.state = 'air';
    this.startAction('finisher', t, { slowmo: true });
    t.stunned(1.2);
    g.slowmo(0.35, 0.9);
    g.cam.cine = 1;
  }

  heal() {
    const g = this.game;
    if (this.focus < 1 || this.hp >= this.maxHp || this.state === 'dead') return;
    this.focus -= 1;
    this.hp = Math.min(this.maxHp, this.hp + 50);
    g.fx.add.emit(this.chestPos(_v), 40, { speed: 3, up: 2, color: [0.6, 3, 1.2], life: 0.9, size: 0.12, gravity: -2 });
    g.audio.reward();
    g.hud.flashText('+HEALTH', '#8dffb0');
  }

  webBomb() {
    const g = this.game;
    if (this.bombCd > 0 || this.state === 'dead') { if (this.bombCd > 0) g.hud.flashText(`WEB BOMB ${Math.ceil(this.bombCd)}s`, '#cfd8ff'); return; }
    this.bombCd = 9;
    if (this.state === 'swing') this.releaseSwing(false);
    this.startAction('bomb', null);
    this.act.onHit = () => {
      const hand = this.char.handWorld('R', _v);
      const t = this.pickTarget(25);
      const dest = t ? t.pos.clone() : (this.aim.valid && this.aim.point.distanceTo(this.pos) < 30 ? this.aim.point.clone() : this.pos.clone().addScaledVector(g.cam.forwardH(_v2), 10));
      const dir = _v2.copy(dest).sub(hand);
      const d = dir.length();
      g.fx.shootBlob(hand, dir.normalize().multiplyScalar(30), d / 30, (p) => this.bombBurst(p.clone()));
      g.audio.thwip(false);
    };
  }

  bombBurst(p) {
    const g = this.game;
    g.fx.ring(p, 9, 0.5);
    g.fx.add.emit(p, 80, { speed: 14, color: [2.4, 2.4, 2.6], life: 0.7, size: 0.14, gravity: 8 });
    g.audio.boom();
    g.cam.shake(0.25);
    g.rumble(0.6, 0.5, 250);
    let n = 0;
    for (const e of g.enemies) if (e.targetable && e.pos.distanceTo(p) < 8) { e.webHit(3, this); n++; }
    if (n) { this.combo += n; this.comboT = 2.6; }
  }

  surge() {
    const g = this.game;
    if (this.focus < 1 || this.state === 'dead') { g.hud.flashText('NEED FOCUS', '#c79bff'); return; }
    this.focus -= 1;
    if (this.state === 'swing') this.releaseSwing(false);
    if (this.state !== 'ground' && this.state !== 'air') this.state = 'air';
    this.startAction('surge', null);
    const bp = this.backPos(_v);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fx.tendril(bp, _v2.copy(this.pos).add(new THREE.Vector3(Math.cos(a) * 8, 0.5 + Math.random() * 3, Math.sin(a) * 8)), 0.45);
    }
    g.slowmo(0.5, 0.3);
    g.audio.suit(true);
  }

  toggleSuit() {
    const g = this.game;
    if (!this.black && g.story && g.story.blackLocked) { g.hud.flashText(g.story.blackLockMsg || 'SUIT UNAVAILABLE', '#b99cff'); return; }
    this.suit = this.black ? 'red' : 'black';
    this.stats.suitSwaps++;
    g.fx.setSuit(this.black);
    g.audio.suit(this.black);
    g.rumble(0.5, 0.35, 350);
    const c = this.chestPos(_v);
    g.fx.dark.emit(c, 60, { speed: 6, color: [0.01, 0.01, 0.02], life: 0.8, size: 0.16, gravity: 2 });
    g.fx.add.emit(c, 30, { speed: 7, color: this.black ? [1.2, 0.5, 2.5] : [3, 0.6, 0.5], life: 0.5, size: 0.12, gravity: 0 });
    g.hud.flashText(this.black ? 'SYMBIOTE SUIT' : 'CLASSIC SUIT', this.black ? '#b99cff' : '#ff6b6b');
  }

  // -------------------------------------------------------------------------
  hurt(dmg, from, kind = 'melee') {
    const g = this.game;
    if (this.invuln > 0 || this.state === 'dead') return false;
    this.hp -= dmg * (this.black ? 0.85 : 1);
    this.lastHurt = 0;
    this.combo = 0;
    this.invuln = 0.45;
    g.cam.shake(0.35);
    g.damageFlash();
    g.audio.hurt();
    g.rumble(0.75, 0.5, 180);
    if (from) {
      const dir = _v.copy(this.pos).sub(from).setY(0).normalize();
      if (this.state === 'ground') { this.vel.addScaledVector(dir, 5); this.hurtT = 0.3; if (this.act && !this.act.dodge) this.endAction(); }
      else if (this.state === 'swing' && kind === 'melee') this.releaseSwing(false);
    }
    if (this.hp <= 0) this.die();
    return true;
  }

  die() {
    const g = this.game;
    this.hp = 0;
    this.state = 'dead'; this.deadT = 0;
    this.act = null;
    g.fx.swingLine.mesh.visible = false;
    g.hud.showDead(true);
    g.slowmo(0.3, 1.2);
    g.rumble(1, 1, 500);
  }

  respawn(water = false) {
    const g = this.game, city = g.city;
    let best = null, bd = Infinity;
    for (const t of city.tops) {
      if (t.small || t.y < 25 || t.y > 120 || t.x1 - t.x0 < 12 || t.z1 - t.z0 < 12) continue;
      const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
      const d = Math.hypot(cx - this.pos.x, cz - this.pos.z);
      if (d < bd) { bd = d; best = t; }
    }
    if (best) this.pos.set((best.x0 + best.x1) / 2, best.y + 2, (best.z0 + best.z1) / 2);
    this.vel.set(0, 0, 0);
    this.state = 'air';
    if (!water) { this.hp = this.maxHp; this.focus = Math.max(this.focus, 1); }
    this.invuln = 2;
    g.hud.showDead(false);
    this.char.snapPivot();
  }

  // -------------------------------------------------------------------------
  animate(dt) {
    const g = this.game, c = this.char, p = this.basePose.reset(), t = g.time;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let k = 14;
    switch (this.state) {
      case 'ground':
        if (this.landT > 0) P.land(p, this.landK * Math.min(1, this.landT / 0.25));
        else if (this.hurtT > 0) P.hit(p, 1);
        else if (hs > 0.8 && !this.act) {
          const sprint = hs > RUN + 1;
          this.runPhase += dt * (hs * (sprint ? 0.55 : 0.85) + 3.5);
          P.run(p, this.runPhase, Math.min(1, hs / 7), sprint ? 1 : 0);
        } else if (this.inCombat || this.act) P.stance(p, t);
        else P.idle(p, t);
        if (this.charging) { p.rootY -= 0.3 * this.charge; p.add('thL', -0.7 * this.charge, 0, 0).add('thR', -0.7 * this.charge, 0, 0).add('knL', 1.3 * this.charge, 0, 0).add('knR', 1.3 * this.charge, 0, 0).add('spine', 0.4 * this.charge, 0, 0); }
        break;
      case 'air':
        if (this.vel.y > 3) P.jump(p, clamp(1 - this.vel.y / 16, 0, 1));
        else if (this.vel.y < -16 && hs < this.vel.y * -1.2) P.dive(p, t);
        else P.fall(p, t);
        break;
      case 'swing': {
        const s = this.swing;
        const rope = _v.copy(s.anchor).sub(this.pos); rope.y -= HAND_Y;
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const lf = rope.x * fx + rope.z * fz;
        const ll = rope.x * fz - rope.z * fx;
        const kk = clamp(-lf / Math.max(4, s.len * 0.6), -1, 1);
        P.swing(p, kk, t);
        p.set('pivot', clamp(Math.atan2(lf, rope.y) * 0.85, -1.3, 1.3), 0, clamp(-Math.atan2(ll, rope.y) * 0.8, -1, 1));
        k = 10;
        break;
      }
      case 'wall': P.wall(p, this.wall.phase, Math.min(1, Math.hypot(this.mv.x, this.mv.y) + this.wall.mom / 6)); break;
      case 'zip': P.zip(p); k = 18; break;
      case 'perch': P.perch(p, t); break;
      case 'dead': P.down(p); k = 8; break;
    }
    const tgt = this.tgtPose;
    if (this.act && !(this.act.zip)) {
      evalAction(tgt, p, ACT[this.act.name], clamp(this.act.t / this.act.dur, 0, 1));
      k = 26;
    } else if (this.act && this.act.zip) { P.zip(tgt.reset()); k = 20; }
    else tgt.copy(p);
    if (this.dashT > 0 && this.state === 'air' && !this.act) { P.zip(tgt.reset()); k = 18; }
    if (this.flipT > 0 && !this.act && this.state === 'air') {
      evalAction(this.flipPose, tgt, ACT[this.flipName], 1 - this.flipT / DUR[this.flipName]);
      tgt.copy(this.flipPose);
      k = 24;
    } else if (this.flipT <= 0 && this.flipWas) {
      const e = c.j.pivot.userData.e;
      if (e) c.snapPivot(...e.map((v) => Math.atan2(Math.sin(v), Math.cos(v))));
    }
    this.flipWas = this.flipT > 0;
    c.drive(tgt, k, dt);
    this.yawVis = dampAngle(this.yawVis, this.yaw, this.state === 'swing' ? 8 : 18, dt);
    c.root.position.copy(this.pos);
    c.root.rotation.y = this.yawVis;
    c.root.updateMatrixWorld(true);

    // limb overrides for webs
    const fx = g.fx;
    if (this.state === 'swing') {
      const at = this.swing.attach || this.swing.anchor;
      c.aimArm('R', at, 1);
      c.root.updateMatrixWorld(true);
      fx.swingLine.set(c.handWorld('R', _v), at, 0.022);
    } else fx.swingLine.mesh.visible = false;
    if (this.state === 'zip') {
      c.aimArm('R', this.zip.point, 1);
      c.root.updateMatrixWorld(true);
      if (this.zip.t / this.zip.dur < 0.95) fx.webLine(c.handWorld('R', _v), this.zip.point, 0.04, 0.02);
    }
    if (this.act && this.act.zip && this.act.target) { c.aimArm('R', this.act.target.chest(_v2), 1); c.root.updateMatrixWorld(true); }
    if (this.act && (this.act.name === 'webShot' || this.act.name === 'yank') && this.act.target) { c.aimArm('R', this.act.target.chest(_v2), 0.85); c.root.updateMatrixWorld(true); }

    c.j.chest.getWorldPosition(HERO_U.uChest.value);
    HERO_U.uMix.value = this.suitMix;
    HERO_U.uTime.value = t;
    if (c.lensMat) c.lensMat.emissiveIntensity = 0.25 + 0.6 * g.renderer.cur.night;
  }
}
void UP;
