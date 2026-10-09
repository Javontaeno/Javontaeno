import * as THREE from 'three';
import { Renderer, TIME_ORDER } from './renderer.js';
import { City, CU, blockRect } from './city.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Player } from './player.js';
import { Enemy, Encounters } from './enemies.js';
import { HUD } from './hud.js';
import { Actor, CAST } from './cast.js';
import { SYM_U } from './character.js';
import { clamp } from './util.js';
import { SETTINGS, saveSettings } from './settings.js';
import { glyph, DEVICE_NAMES } from './controls.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const _v = new THREE.Vector3();

// Focus-based navigation for the title, pause and victory screens (controller, keyboard or mouse).
class MenuNav {
  constructor(game) { this.g = game; this.screen = null; this.i = 0; this.keyNav = false; this.bound = new WeakSet(); }
  items() { return this.screen ? [...this.screen.querySelectorAll('.nav')].filter((el) => el.offsetParent !== null) : []; }
  set(screen) {
    if (this.screen === screen) return;
    this.screen = screen; this.i = 0;
    for (const el of this.items()) {
      if (this.bound.has(el)) continue;
      this.bound.add(el);
      el.addEventListener('mouseenter', () => { this.i = this.items().indexOf(el); this.highlight(); });
    }
    this.highlight();
  }
  highlight() {
    document.querySelectorAll('.nav.focus').forEach((e) => e.classList.remove('focus'));
    const it = this.items();
    if (!it.length) return;
    this.i = ((this.i % it.length) + it.length) % it.length;
    if (this.g.input.usingPad || this.keyNav) it[this.i].classList.add('focus');
  }
  update() {
    const inp = this.g.input, it = this.items();
    if (!it.length) return;
    const cur = it[this.i] || it[0];
    let moved = false;
    if (inp.menu('up')) { this.i--; moved = true; }
    if (inp.menu('down')) { this.i++; moved = true; }
    if (inp.menu('left')) { if (cur.dataset.adjust) this.g.adjust(cur.dataset.adjust, -1); else { this.i--; moved = true; } }
    if (inp.menu('right')) { if (cur.dataset.adjust) this.g.adjust(cur.dataset.adjust, 1); else { this.i++; moved = true; } }
    if (moved) { this.keyNav = true; this.g.audio.ui(); }
    this.highlight();
    if (inp.menu('confirm')) { const el = this.items()[this.i]; if (el) { this.keyNav = true; el.click(); } }
  }
}

const SETTING_LABELS = { vibration: 'VIBRATION', invertY: 'INVERT CAMERA Y' };

function storedQuality() {
  const q = params.get('q');
  if (q !== null) return clamp(parseInt(q, 10) || 0, 0, 2);
  try { const s = localStorage.getItem('shadowweb-q'); if (s !== null) return clamp(parseInt(s, 10) || 0, 0, 2); } catch { /* storage blocked */ }
  return 1;
}

class Game {
  constructor() {
    this.time = 0;
    this.level = 1; this.xp = 0; this.xpNeed = 600;
    this.enemies = [];
    this.tokens = new Set();
    this.slowT = 0; this.slowScale = 1; this.stopT = 0; this.dmgT = 0; this.slowFx = 0;
    this.running = false; this.paused = false;
    this.victory = false;
  }

  init() {
    const canvas = document.getElementById('c');
    this.quality = storedQuality();
    this.renderer = new Renderer(canvas, this.quality);
    this.scene = this.renderer.scene;
    this.camera = this.renderer.camera;
    this.city = new City(this.scene, this.quality);
    this.fx = new FX(this.scene);
    this.audio = new Audio();
    this.input = new Input(canvas);
    this.cam = new CameraRig(this.camera, this.city);
    this.player = new Player(this);
    this.encounters = new Encounters(this);
    this.hud = new HUD(this);
    this.placePlayer();
    this.renderer.resize();
    this.menu = new MenuNav(this);
    this.input.onLockChange = (locked) => {
      if (!this.running || TEST || this.victory) return;
      if (!locked) this.setPaused(true); else if (this.paused) this.setPaused(false);
    };
    this.input.onDeviceChange = (d) => { this.hud.refreshPrompts(d); this.menu.highlight(); };
    this.input.onPadConnect = (kind) => {
      this.input.setDevice(kind);
      this.toast(`<b>${DEVICE_NAMES[kind].toUpperCase()}</b> connected`, 3);
      this.rumble(0.4, 0.4, 200);
    };
    this.input.onPadDisconnect = () => {
      this.toast('<b>CONTROLLER DISCONNECTED</b>', 3);
      if (this.running && !this.paused) this.setPaused(true);
    };
    this.hud.refreshPrompts(this.input.device);
    this.refreshSettingLabels();
    window.__game = this;
    window.__THREE = THREE;
    window.__Enemy = Enemy;
    window.__Actor = Actor; window.__CAST = CAST;
  }

  placePlayer() {
    // start perched on a rooftop with midtown's skyline ahead
    const b = blockRect(4, 11);
    let best = null;
    for (const t of this.city.tops) {
      if (t.small || t.y < 45 || t.y > 120 || t.x1 - t.x0 < 14) continue;
      const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
      if (this.city.hives.some((h) => Math.hypot(h.pos.x - cx, h.pos.z - cz) < 110)) continue;
      if (this.city.roofAt(cx, t.z0 - 3) > t.y - 10) continue; // need an open view north
      const d = Math.hypot(cx - (b.x0 + b.x1) / 2, cz - (b.z0 + b.z1) / 2);
      if (!best || d < best.d) best = { t, d };
    }
    const t = best ? best.t : { x0: -5, x1: 5, z0: -5, z1: 5, y: 60 };
    this.city.hideParapet(t);
    const p = new THREE.Vector3((t.x0 + t.x1) / 2, t.y, t.z0 + 0.25);
    this.player.pos.copy(p);
    this.player.state = 'perch';
    this.player.perchDir.set(0, 0, -1);
    this.player.yaw = this.player.yawVis = Math.PI;
    this.cam.yaw = Math.PI;
    this.cam.pitch = 0.2;
    this.cam.cine = 0.85;
    this.introCine = true;
    this.cam.focus.copy(p).setY(p.y + 1.2);
  }

  // ---------------------------------------------------------------------------
  requestToken(e, ranged) {
    if (this.tokens.has(e)) return true;
    let melee = 0, guns = 0;
    for (const t of this.tokens) (t.cfg.ranged ? guns++ : melee++);
    const crowd = this.enemies.filter((x) => x.alive && x.alerted && !x.cfg.ranged).length;
    if (ranged ? guns >= 2 : melee >= (crowd >= 4 ? 3 : 2)) return false;
    if (this.player.state === 'dead') return false;
    this.tokens.add(e);
    e.token = true;
    return true;
  }
  hitstop(t) { this.stopT = Math.max(this.stopT, t); }
  slowmo(scale, dur) { this.slowScale = scale; this.slowT = Math.max(this.slowT, dur); }
  damageFlash() { this.dmgT = 1; }
  toast(msg, t) { this.hud.toast(msg, t); }

  addXp(n) {
    this.xp += n;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = Math.round(this.xpNeed * 1.35);
      const p = this.player;
      p.maxHp += 12; p.hp = p.maxHp; p.focus = Math.min(3, p.focus + 1);
      this.hud.flashText(`LEVEL ${this.level}`, '#ffd36a');
      this.toast(`<b>LEVEL UP</b> &mdash; health +12, damage +7%`);
      this.audio.reward();
    }
  }

  onEnemyKO(e, spec) {
    const p = this.player;
    p.stats.kos++;
    p.focus = Math.min(3, p.focus + 0.12);
    this.addXp(e.cfg.xp * (spec && spec.finisher ? 2 : 1));
    if (spec && spec.finisher) { this.fx.ring(e.pos, 6, 0.5); this.audio.boom(); }
  }

  onEventCleared(ev) {
    const xp = ev.type === 'outbreak' ? 260 : 200;
    this.addXp(xp);
    this.player.stats.events++;
    this.toast(`<b>${ev.label.toUpperCase()} STOPPED</b> &nbsp;+${xp} XP`);
    this.audio.reward();
  }

  hiveTarget(h) {
    if (!h.target) {
      const game = this;
      h.target = {
        isHive: true, hive: h, pos: h.pos, radius: 4.5, heavy: true, canLaunch: false, airborne: false, threatT: -1, webLevel: 0,
        get alive() { return h.solid; }, get targetable() { return h.solid; },
        get hp() { return h.hp; }, get maxHp() { return h.maxHp; },
        chest: (o = new THREE.Vector3()) => o.copy(h.pos).setY(h.pos.y + 0.5),
        takeHit: (spec) => game.damageHive(h, spec.dmg),
        webHit() {}, yankTo() {}, grabSlam() {}, stunned() {},
      };
    }
    return h.target;
  }

  damageHive(h, dmg) {
    if (!h.solid) return false;
    const ev = this.encounters.events.find((e) => e.hive === h);
    const guards = ev ? ev.enemies.filter((e) => e.alive && e.pos.distanceTo(h.pos) < 26 && Math.abs(e.pos.y - h.roof.y1) < 4).length : 0;
    const k = guards > 0 ? 0.45 : 1;
    h.hp -= Math.min(dmg, 200) * k;
    this.fx.dark.emit(h.pos, 20, { speed: 7, up: 3, color: [0.02, 0.0, 0.03], life: 0.8, size: 0.25 });
    this.audio.hive();
    if (guards > 0 && Math.random() < 0.3) this.hud.flashText('CLEAR THE GUARDS', '#ff7b8a');
    if (h.hp <= 0) {
      h.alive = false;
      h.hp = 0;
      this.player.stats.hives++;
      this.fx.ring(h.pos, 22, 0.9, [2.5, 0.3, 0.6]);
      this.fx.dark.emit(h.pos, 160, { speed: 18, up: 8, color: [0.02, 0.0, 0.03], life: 1.6, size: 0.4, gravity: 10 });
      this.fx.add.emit(h.pos, 80, { speed: 14, up: 6, color: [3, 0.3, 0.6], color2: [1.2, 0.3, 2.5], life: 1.2, size: 0.18 });
      this.audio.boom();
      this.cam.shake(0.8);
      this.rumble(1, 1, 700);
      this.slowmo(0.3, 1.0);
      for (const e of this.enemies) if (e.ev === ev && e.alive) e.ko(new THREE.Vector3(0, 0, 0), { kb: 2 });
      const left = this.city.hives.filter((x) => x.alive).length;
      this.addXp(500);
      this.hud.flashText('HIVE DESTROYED', '#ff4d6a');
      this.toast(left ? `<b>HIVE DESTROYED</b> &mdash; ${left} remaining` : '<b>ALL HIVES DESTROYED</b>', 4);
      if (!left && !(this.story && this.story.campaign)) setTimeout(() => this.win(), 2200);
    }
    return true;
  }

  win() {
    this.victory = true;
    const s = this.player.stats;
    document.getElementById('victoryStats').innerHTML = `Level ${this.level} &middot; ${s.kos} takedowns &middot; ${s.events} crimes stopped &middot; best combo x${this.player.bestCombo}`;
    this.hud.showVictory(true);
    document.exitPointerLock?.();
  }

  setPaused(p) {
    if (p === this.paused) return;
    this.paused = p;
    this.pauseT = 0;
    document.getElementById('pause').classList.toggle('show', p && !this.victory);
    if (p) this.rumble(0, 0, 1);
  }

  resume() {
    this.setPaused(false);
    this.skipFrame = true;
    if (!TEST && !this.input.usingPad) this.input.lock();
  }

  rumble(strong, weak, ms) { this.input.rumble(strong, weak, ms); }

  toggleSetting(key) {
    SETTINGS[key] = !SETTINGS[key];
    saveSettings();
    if (key === 'vibration' && SETTINGS.vibration) this.rumble(0.5, 0.5, 200);
    this.refreshSettingLabels();
    this.audio.ui();
  }

  adjust(key, d) {
    if (key === 'sens') SETTINGS.sens = clamp(Math.round((SETTINGS.sens + d * 0.1) * 10) / 10, 0.3, 2.5);
    saveSettings();
    this.refreshSettingLabels();
    this.audio.ui();
  }

  refreshSettingLabels() {
    document.querySelectorAll('[data-set]').forEach((el) => { el.textContent = `${SETTING_LABELS[el.dataset.set]}: ${SETTINGS[el.dataset.set] ? 'ON' : 'OFF'}`; });
    const sb = document.getElementById('sensBtn');
    if (sb) sb.textContent = `CAMERA SENSITIVITY: ◀ ${SETTINGS.sens.toFixed(1)} ▶`;
    const mb = document.getElementById('muteBtn');
    if (mb) mb.textContent = `SOUND: ${this.audio.muted ? 'OFF' : 'ON'}`;
  }

  cycleTime() {
    const i = TIME_ORDER.indexOf(this.renderer.timeKey);
    this.renderer.setTime(TIME_ORDER[(i + 1) % TIME_ORDER.length]);
    this.audio.ui();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.skipFrame = true;
    document.getElementById('title').classList.add('hidden');
    this.hud.el.hud.classList.add('on');
    this.audio.init();
    if (!TEST && !this.input.usingPad) this.input.lock();
    this.toast(`Destroy the <b>symbiote hives</b>. Hold ${glyph('swing', this.input.device)} in the air to swing.`, 6);
  }

  // ---------------------------------------------------------------------------
  frame(now) {
    const rdt = Math.min(0.05, Math.max(0.0001, (now - (this.last || now)) / 1000));
    this.last = now;
    const inp = this.input;
    inp.pollPad(rdt);
    inp.tick(rdt);
    // browsers only unlock audio on a gesture; keep nudging it for controller-only players
    if (this.audio.ctx && this.audio.ctx.state === 'suspended' && inp.padB.some((v) => v > 0.5)) this.audio.ctx.resume();
    const screen = !this.running ? this.titleEl : this.victory ? this.victoryEl : this.paused ? this.pauseEl : null;
    this.menu.set(screen);
    if (screen) this.menu.update();
    if (!this.running && inp.menu('start')) this.start();

    if (this.running && !this.paused) {
      if (this.skipFrame) this.skipFrame = false;
      else {
        if (inp.pressed('pause') && !this.victory) { this.setPaused(true); if (inp.locked) document.exitPointerLock?.(); }
        if (inp.pressed('time')) this.cycleTime();
        if (inp.pressed('mute')) { this.audio.setMuted(!this.audio.muted); this.refreshSettingLabels(); }
        if (inp.pressed('help')) this.hud.toggleHelp();
        if (inp.pressed('recenter')) this.cam.recenter(this.player.yawVis);
        if (!this.paused) this.step(rdt);
      }
    } else if (this.running && this.paused) {
      this.pauseT += rdt;
      if (this.pauseT > 0.25 && (inp.menu('back') || inp.menu('start'))) this.resume();
    } else {
      // title screen: slow orbit
      this.cam.yaw += rdt * 0.05;
      this.cam.update(rdt, this.player, { x: 0, y: 0 });
      this.player.animate(rdt);
      this.renderer.update(rdt, this.player.pos);
      this.fx.update(rdt, this.camera.position, this.player.chestPos(_v), 0);
      CU.uTime.value += rdt;
    }
    this.renderer.render();
    inp.endFrame();
  }

  step(rdt) {
    let dt = rdt;
    if (this.slowT > 0) { this.slowT -= rdt; dt *= this.slowScale; }
    this.slowFx += ((this.slowT > 0 ? 1 : 0) - this.slowFx) * Math.min(1, rdt * 8);
    if (this.stopT > 0) { this.stopT -= rdt; dt *= 0.04; }
    this.dmgT = Math.max(0, this.dmgT - rdt * 2.2);
    this.time += dt;
    CU.uTime.value += dt;
    SYM_U.uTime.value = this.time;

    const pl = this.player;
    pl.update(dt);
    if (this.introCine && pl.state !== 'perch') { this.introCine = false; this.cam.cine = 0; }
    for (const e of [...this.enemies]) e.update(dt);
    // combat awareness & spider-sense
    let inCombat = false, threat = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.alerted && e.pos.distanceTo(pl.pos) < 35) inCombat = true;
      if (e.targetsPlayer && e.threatT >= 0 && e.threatT < 0.5) threat = true;
    }
    pl.inCombat = inCombat;
    if (threat) {
      if (!this.senseOn) this.audio.sense();
      pl.sense = 1;
    }
    this.senseOn = threat;
    this.encounters.update(dt);
    const blockers = this._blk || (this._blk = []);
    blockers.length = 0;
    if (pl.pos.y < 3) blockers.push({ x: pl.pos.x, z: pl.pos.z, r: 4 });
    for (const ev of this.encounters.events) if (ev.spawned && !ev.cleared && ev.pos.y < 1) blockers.push({ x: ev.pos.x, z: ev.pos.z, r: 22 });
    this.city.update(dt, blockers);
    this.cam.update(rdt, pl, this.input.look(rdt));
    this.renderer.update(rdt, pl.pos);
    this.fx.update(dt, this.camera.position, pl.chestPos(_v).setY(pl.pos.y + 1.9), pl.sense);
    const u = this.renderer.fx.uniforms;
    const sp = pl.vel.length();
    u.uSpeed.value += (clamp((sp - 16) / 34, 0, 1) - u.uSpeed.value) * Math.min(1, rdt * 4);
    u.uTime.value = this.time;
    u.uDamage.value = Math.max(this.dmgT, pl.hp / pl.maxHp < 0.3 ? 0.35 + Math.sin(this.time * 6) * 0.1 : 0);
    u.uSlow.value = this.slowFx;
    u.uSense.value = pl.sense;
    u.uSuit.value = pl.suitMix;
    this.audio.update(rdt, sp, inCombat);
    this.hud.update(rdt);
  }

  run() {
    const loop = (t) => { this.frame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}

// ---------------------------------------------------------------------------
function boot() {
  const game = new Game();
  try {
    game.init();
  } catch (err) {
    document.getElementById('loading').innerHTML = `<div style="max-width:600px;text-align:center;letter-spacing:.05em;text-transform:none">Could not start WebGL.<br><small>${String(err && err.message || err)}</small></div>`;
    throw err;
  }
  document.getElementById('loading').classList.add('hidden');
  const title = document.getElementById('title');
  const q = game.quality;
  title.querySelectorAll('.opts button').forEach((b) => {
    b.classList.toggle('on', +b.dataset.q === q);
    b.onclick = () => {
      try { localStorage.setItem('shadowweb-q', b.dataset.q); } catch { /* ignore */ }
      if (+b.dataset.q !== q) location.reload();
    };
  });
  document.getElementById('playBtn').onclick = () => game.start();
  game.titleEl = title;
  game.pauseEl = document.getElementById('pause');
  game.victoryEl = document.getElementById('victory');
  document.getElementById('resumeBtn').onclick = () => game.resume();
  document.getElementById('timeBtn').onclick = () => game.cycleTime();
  document.getElementById('muteBtn').onclick = () => { game.audio.setMuted(!game.audio.muted); game.refreshSettingLabels(); };
  document.getElementById('controlsBtn').onclick = () => { game.hud.toggleHelp(true); game.resume(); };
  document.querySelectorAll('[data-set]').forEach((el) => { el.onclick = () => game.toggleSetting(el.dataset.set); });
  document.getElementById('sensBtn').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); game.adjust('sens', e.clientX && e.clientX < r.left + r.width / 2 ? -1 : 1); };
  document.getElementById('victoryBtn').onclick = () => { game.hud.showVictory(false); game.victory = false; game.setPaused(false); game.skipFrame = true; if (!game.input.usingPad) game.input.lock(); };
  game.renderer.r.domElement.addEventListener('click', () => { if (game.running && !game.paused && !TEST) game.input.lock(); });
  // unlock audio on the first keyboard/mouse gesture too
  const unlock = () => { if (game.audio.ctx && game.audio.ctx.state === 'suspended') game.audio.ctx.resume(); };
  addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  if (TEST) game.start(); else title.classList.remove('hidden');
  game.run();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 30));
else setTimeout(boot, 30);
