import * as THREE from 'three';
import { Actor } from '../cast.js';
import { Enemy } from '../enemies.js';
import { Boss, VenomHydra, projectiles } from '../bosses.js';
import { StoryUI } from './ui.js';
import { loadSave, writeSave } from './save.js';
import { MISSIONS } from './missions.js';
import { clamp, damp } from '../util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

// Missions are generator functions that yield commands; each command runs until done.
// Plain helper calls (spawn, actor, place...) happen immediately.
export class Story {
  constructor(game) {
    this.g = game;
    this.ui = new StoryUI(game);
    this.campaign = false;
    this.index = 0;
    this.gen = null; this.cmd = null; this.result = undefined;
    this.cine = false;
    this.karma = 0;
    this.choices = {};
    this.blackLocked = false;
    this.actors = []; this.groups = []; this.props = []; this.bosses = []; this.adopted = [];
    this.objective = ''; this.marker = null; this.markerLabel = '';
    this.camOv = null; this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    this.failing = 0;
    this.waiting = false;
    this.done = false;
    this.missions = MISSIONS;
  }

  get active() { return !!this.gen; }

  // --- campaign flow --------------------------------------------------------
  newGame() {
    this.campaign = true; this.index = 0; this.karma = 0; this.choices = {}; this.done = false;
    this.startMission(0);
  }

  continueGame() {
    const s = loadSave();
    if (!s) return this.newGame();
    const g = this.g;
    this.campaign = true;
    this.index = s.index; this.karma = s.karma || 0; this.choices = s.choices || {};
    g.level = s.level || 1; g.xp = s.xp || 0; g.xpNeed = s.xpNeed || 600;
    g.player.maxHp = s.maxHp || 120; g.player.hp = g.player.maxHp;
    this.done = !!s.done;
    if (this.done || this.index >= MISSIONS.length) { this.done = true; this.postGame(); return; }
    this.startMission(this.index);
  }

  save() {
    const g = this.g;
    writeSave({ index: this.index, karma: this.karma, choices: this.choices, level: g.level, xp: g.xp, xpNeed: g.xpNeed, maxHp: g.player.maxHp, done: this.done });
  }

  startMission(i) {
    this.cleanup();
    this.index = i;
    const m = MISSIONS[i];
    this.mission = m;
    this.waiting = false;
    this.save();
    this.gen = m.run(this.api(), this);
    this.cmd = null; this.result = undefined;
    this.g.player.hp = this.g.player.maxHp;
    this.ui.missionTitle(m.act, m.title);
  }

  finishMission() {
    const g = this.g;
    this.gen = null; this.cmd = null;
    this.cleanup(true);
    this.index++;
    if (this.index >= MISSIONS.length) { this.done = true; this.save(); this.postGame(); return; }
    g.addXp(250);
    this.save();
    const next = MISSIONS[this.index];
    if (next.chain) { this.startMission(this.index); return; }
    this.waiting = true;
    g.hud.flashText('MISSION COMPLETE', '#ffd36a');
    g.toast(`Next: <b>${next.title}</b> &mdash; follow the gold marker`, 5);
  }

  postGame() {
    const g = this.g;
    this.gen = null; this.waiting = false; this.campaign = true; this.done = true;
    g.city.setHives(g.city.hives.some((h) => h.alive), true);
    this.blackLocked = false;
    this.objective = 'Free roam — stop crimes and outbreaks';
  }

  fail(msg) {
    if (this.failing > 0) return;
    this.failing = 3.2;
    this.g.hud.flashText(msg || 'MISSION FAILED', '#ff6b6b');
    this.g.toast('<b>MISSION FAILED</b> &mdash; retrying', 3);
  }

  restartMission() { if (this.gen || this.waiting) this.startMission(this.index); }

  // Keep track of anything a mission creates so retries and transitions start clean.
  adopt(e) { this.adopted.push(e); }

  cleanup(keepAllies = false) {
    const g = this.g;
    for (const grp of this.groups) for (const e of grp.enemies) e.remove();
    for (const e of this.adopted) e.remove && e.remove();
    for (const b of this.bosses) b.remove();
    for (const a of this.actors) if (!(keepAllies && a.keep)) a.remove();
    for (const p of this.props) if (!p.keep) p.remove();
    this.groups = []; this.adopted = []; this.bosses = [];
    this.actors = this.actors.filter((a) => keepAllies && a.keep && !a.removed);
    this.props = this.props.filter((p) => p.keep);
    for (const e of [...g.enemies]) if (e.isHead || (e.isBoss && !e.removed)) e.remove();
    projectiles(g).clear();
    this.camOv = null; this.cine = false;
    this.objective = ''; this.marker = null;
    this.ui.reset();
    g.cam.cine = 0;
    g.slowT = 0;
  }

  // --- per frame ------------------------------------------------------------
  update(dt, rdt) {
    const g = this.g, pl = g.player;
    for (const a of this.actors) if (!a.removed) a.update(dt);
    for (const p of this.props) p.update && p.update(dt);
    for (const b of this.bosses) if (b.update && b instanceof VenomHydra) b.update(dt);
    projectiles(g).update(dt);
    this.ui.update(rdt, this.karma);
    if (this.barkT > 0) { this.barkT -= rdt; if (this.barkT <= 0 && this.barkNext) this.barkNext(); }
    if (this.failing > 0) {
      this.failing -= rdt;
      if (this.failing <= 0) { pl.respawn(); this.startMission(this.index); }
      return;
    }
    if (this.waiting) {
      const m = MISSIONS[this.index];
      const p = m.start(this);
      this.marker = p; this.markerLabel = m.title; this.objective = `Mission: ${m.title}`;
      if (pl.pos.distanceTo(p) < 14 && pl.state !== 'dead') this.startMission(this.index);
      return;
    }
    if (!this.gen) return;
    if (pl.state === 'dead' && !this.cine) { this.fail('DEFEATED'); return; }
    // run the mission script
    for (let guard = 0; guard < 50; guard++) {
      if (this.cmd) {
        if (!this.cmd.skip && !this.cmd.update(dt, rdt)) break;
        this.result = this.cmd.result;
        this.cmd.end && this.cmd.end();
        this.cmd = null;
      }
      const r = this.gen.next(this.result);
      this.result = undefined;
      if (r.done) { this.finishMission(); break; }
      this.cmd = r.value;
      this.cmd.start && this.cmd.start();
    }
  }

  // Camera override used by cutscenes.
  applyCamera(rdt) {
    const ov = this.camOv;
    if (!ov) return false;
    const cam = this.g.camera;
    const pos = typeof ov.pos === 'function' ? ov.pos() : ov.pos;
    const look = typeof ov.look === 'function' ? ov.look() : ov.look;
    if (ov.snap) { this.camPos.copy(pos); this.camLook.copy(look); ov.snap = false; }
    this.camPos.lerp(pos, damp(ov.k || 3, rdt));
    this.camLook.lerp(look, damp((ov.k || 3) * 1.5, rdt));
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    cam.fov += ((ov.fov || 55) - cam.fov) * damp(3, rdt);
    cam.updateProjectionMatrix();
    return true;
  }

  // --- script API -----------------------------------------------------------
  api() {
    const S = this, g = this.g, pl = g.player;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const confirm = () => g.input.pressed('attack') || g.input.pressed('jump') || g.input.menu('confirm');
    const api = {
      V, g, story: S,
      // ---- instant helpers ----
      place(pos, yaw = 0, state = 'ground') {
        pl.pos.copy(pos);
        if (state !== 'perch') pl.pos.y = g.city.groundAt(pos.x, pos.z, pos.y + 1);
        pl.vel.set(0, 0, 0); pl.state = state; pl.act = null; pl.yaw = pl.yawVis = yaw;
        pl.char.snapPivot();
        g.cam.yaw = yaw; g.cam.pitch = 0.18; g.cam.focus.copy(pl.pos).setY(pl.pos.y + 1.5);
        pl.hp = pl.maxHp;
      },
      time(k, instant = false) { g.renderer.setTime(k); if (instant) { g.renderer.blend = 1; g.renderer.applyTime(1); g.renderer.envTimer = 0; } },
      lockBlack(v) { S.blackLocked = v; if (v && pl.black) { pl.suit = 'red'; pl.suitMix = 0; g.fx.setSuit(false); } },
      forceSuit(black) { if (pl.black !== black) pl.toggleSuit(); },
      hives(active, instant) { g.city.setHives(active, instant); },
      objective(t) { S.objective = t; },
      marker(p, label) { S.marker = p; S.markerLabel = label || ''; },
      clearMarker() { S.marker = null; },
      karma(n) { S.karma = clamp(S.karma + n, -10, 10); g.hud.flashText(n > 0 ? 'RED KARMA +' + n : 'BLACK KARMA ' + n, n > 0 ? '#ff6b6b' : '#b99cff'); },
      toast(t, d) { g.toast(t, d); },
      flash(t, c) { g.hud.flashText(t, c); },
      news(t) { S.ui.news(t); },
      actor(id, pos, o = {}) { const a = new Actor(g, id, pos, o); a.keep = !!o.keep; S.actors.push(a); return a; },
      ally(id, pos, o = {}) { const a = api.actor(id, pos || pl.pos.clone().add(V(2, 0, 2)), { ...o, ally: true }); return a; },
      dismiss(a) { if (a && !a.removed) { a.remove(); S.actors = S.actors.filter((x) => x !== a); } },
      group(list, center, o = {}) {
        const grp = { enemies: [], alerted: !!o.alerted, get alive() { return this.enemies.filter((e) => e.alive).length; } };
        list.forEach((spec, k) => {
          const [type, opt] = Array.isArray(spec) ? spec : [spec, {}];
          let p = null;
          for (let a = 0; a < 30 && !p; a++) {
            const ang = (k / list.length) * Math.PI * 2 + a * 0.9, r = (o.r || 5) * (0.5 + Math.random() * 0.6);
            const x = center.x + Math.cos(ang) * r, z = center.z + Math.sin(ang) * r;
            const gy = g.city.groundAt(x, z, center.y + 1);
            if (Math.abs(gy - center.y) > 0.6) continue;
            if (g.city.pointInBox(V(x, gy + 0.9, z), 0.2)) continue;
            p = V(x, gy, z);
          }
          if (!p) p = center.clone();
          const e = new Enemy(g, type, p, grp, { ...(o.opts || {}), ...(opt || {}) });
          if (o.alerted) e.alerted = true;
          grp.enemies.push(e);
          g.enemies.push(e);
        });
        S.groups.push(grp);
        return grp;
      },
      boss(id, pos, o = {}) {
        const b = new Boss(g, id, pos, o);
        g.enemies.push(b);
        S.bosses.push(b);
        return b;
      },
      hydra(pos) { const h = new VenomHydra(g, pos); S.bosses.push(h); return h; },
      prop(p, keep = false) { p.keep = keep; S.props.push(p); return p; },
      cam(pos, look, o = {}) { S.camOv = { pos, look, k: o.k || 3, fov: o.fov || 55, snap: o.snap }; },
      camOff() { S.camOv = null; },
      // Frame a character's face from the front.
      shot(who, o = {}) {
        const head = () => (who === 'spidey' ? pl.pos : who.pos).clone().setY((who === 'spidey' ? pl.pos.y : who.pos.y) + (o.h || 1.6) * (who.char ? who.char.scale : 1));
        const yaw = () => (who === 'spidey' ? pl.yawVis : who.yaw) + (o.side || 0.45);
        api.cam(() => head().add(V(Math.sin(yaw()) * (o.d || 3.2), 0.25, Math.cos(yaw()) * (o.d || 3.2))), head, { k: o.k || 4, fov: o.fov || 45, snap: o.snap });
      },
      faceEachOther(a, b) { const pa = a === 'spidey' ? pl.pos : a.pos, pb = b === 'spidey' ? pl.pos : b.pos; if (a === 'spidey') pl.yaw = pl.yawVis = Math.atan2(pb.x - pa.x, pb.z - pa.z); else a.face(pb); if (b === 'spidey') pl.yaw = pl.yawVis = Math.atan2(pa.x - pb.x, pa.z - pb.z); else b.face(pa); },
      cine(on) { S.cine = on; S.ui.letterbox(on); if (!on) { S.camOv = null; } },
      bossBar(b) { S.ui.boss(b); },
      // ---- yieldable commands ----
      wait(t) { let e = 0; return { update(dt, rdt) { e += rdt; return e >= t; } }; },
      until(fn, label) { return { start() { if (label) S.objective = label; }, update: () => !!fn() }; },
      say(lines, o = {}) {
        let i = -1, t = 0, dur = 0;
        const next = () => {
          i++;
          if (i >= lines.length) return false;
          const l = lines[i];
          const [who, text, camFn] = Array.isArray(l) ? l : [l.who, l.text, l.cam];
          S.ui.line(who, text);
          if (camFn) camFn();
          dur = Math.max(1.8, text.length * 0.05 + 0.9);
          t = 0;
          g.audio.tone({ freq: 520 + (who.length * 37) % 300, dur: 0.05, gain: 0.04, type: 'triangle' });
          return true;
        };
        return {
          start() { if (o.cine !== false) api.cine(true); next(); },
          update(dt, rdt) {
            t += rdt;
            const typed = S.ui.updateTyping(rdt);
            if (confirm() && t > 0.15) { if (!typed) { S.ui.finishTyping(); return false; } t = dur; }
            if (t >= dur) { if (!next()) return true; }
            return false;
          },
          end() { S.ui.hideLine(); if (o.cine !== false && !o.keepCine) api.cine(false); },
        };
      },
      // Subtitles that play while you keep control.
      bark(lines) {
        let i = 0, t = 0;
        const run = () => {
          if (i >= lines.length) { S.ui.hideLine(); return; }
          const [who, text] = lines[i];
          S.ui.line(who, text); S.ui.finishTyping();
          t = Math.max(2.2, text.length * 0.055 + 1);
          i++;
          S.barkT = t; S.barkNext = run;
        };
        run();
      },
      goto(pos, r, label, o = {}) {
        return {
          kind: 'goto',
          start() { S.objective = label; S.marker = pos; S.markerLabel = o.short || ''; },
          update() { const d = Math.hypot(pl.pos.x - pos.x, pl.pos.z - pos.z); if (o.fail) { const f = o.fail(); if (f) S.fail(f); } return d < r && Math.abs(pl.pos.y - pos.y) < (o.dy ?? 1e9) && pl.state !== 'dead'; },
          end() { S.marker = null; },
        };
      },
      defeat(groups, label) {
        const gs = Array.isArray(groups) ? groups : [groups];
        return {
          start() { for (const gr of gs) gr.alerted = true; },
          update() {
            const n = gs.reduce((a, gr) => a + gr.alive, 0);
            S.objective = `${label}${n > 0 ? ` (${n} left)` : ''}`;
            const near = gs.flatMap((gr) => gr.enemies.filter((e) => e.alive)).sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos))[0];
            S.marker = near && near.pos.distanceTo(pl.pos) > 30 ? near.pos : null;
            return n === 0;
          },
          end() { S.marker = null; },
        };
      },
      fight(b, label, o = {}) {
        return {
          start() { S.ui.boss(b); S.objective = label || `Defeat ${b.name}`; if (o.endAt !== undefined) b.endAt = o.endAt; },
          update() { if (b.heads) return b.killed >= 4; return b.defeated || !b.alive; },
          end() { S.ui.boss(null); },
        };
      },
      choice(title, red, black) {
        return {
          kind: 'choice',
          start() { api.cine(true); S.ui.choice({ title, red, black }); g.slowmo(0.15, 999); },
          update() {
            const inp = g.input;
            if (inp.menu('left') || inp.pressed('dash')) S.ui.selectChoice('red');
            if (inp.menu('right')) S.ui.selectChoice('black');
            if (S.ui.choicePick) { this.result = S.ui.choicePick; return true; }
            if (inp.menu('confirm') || inp.pressed('attack')) { this.result = S.ui.choiceSel; return true; }
            return false;
          },
          end() { S.ui.hideChoice(); g.slowT = 0; api.cine(false); g.audio.reward(); },
        };
      },
      card(title, sub, dur = 3) {
        let t = 0;
        return { start() { S.ui.card(title, sub); }, update(dt, rdt) { t += rdt; return t >= dur; }, end() { S.ui.hideCard(); } };
      },
      // Free-form scripted sequence: fn(t, rdt) returns true when finished.
      scene(fn, o = {}) {
        let t = 0;
        return { start() { if (o.cine !== false) api.cine(true); }, update(dt, rdt) { t += rdt; return !!fn(t, rdt) || t > (o.max || 30); }, end() { if (o.cine !== false && !o.keepCine) api.cine(false); } };
      },
    };
    return api;
  }

  // Debug: force the current command to finish (used by automated playtests).
  debugSkip(pick = 'red') {
    const c = this.cmd; const g = this.g;
    if (!c) return;
    for (const gr of this.groups) for (const e of gr.enemies) if (e.alive) { e.hp = 0; e.ko(new THREE.Vector3(), {}); }
    for (const b of this.bosses) {
      if (b.heads) b.heads.slice(0, 4).forEach((h) => h.takeHit({ dmg: 9999 }));
      else if (b.alive && !b.defeated) { b.hp = b.endAt * b.maxHp + 1; b.takeHit({ dmg: 9999, heavy: true }, new THREE.Vector3(1, 0, 0), null); }
    }
    if (c.kind === 'goto' && this.marker) { g.player.pos.copy(this.marker); g.player.state = 'air'; }
    if (c.kind === 'choice') c.result = pick;
    c.skip = true;
  }
}
