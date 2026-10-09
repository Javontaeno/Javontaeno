import * as THREE from 'three';
import { L, blockRect } from './city.js';
import { clamp } from './util.js';
import { glyph, controlRows, TITLE_ROWS, TITLE_LABELS, DEVICE_NAMES } from './controls.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const WORDS = [[60, 'ULTIMATE!'], [40, 'SENSATIONAL!'], [25, 'SPECTACULAR!'], [12, 'AMAZING!'], [5, 'NICE!']];

export class HUD {
  constructor(game) {
    this.g = game;
    this.el = {
      hud: $('hud'), hp: $('hpFill'), hpLag: $('hpLag'), focus: [...document.querySelectorAll('.fseg i')], suit: $('suitBadge'),
      level: $('lvl'), xp: $('xpFill'), combo: $('combo'), comboN: $('comboN'), comboW: $('comboW'), obj: $('objective'),
      toast: $('toast'), flash: $('flashText'), reticle: $('reticle'), lock: $('lock'), markers: $('markers'), bars: $('bars'),
      mini: $('minimap'), dead: $('dead'), help: $('help'), sense: $('senseIcon'), time: $('timeLabel'), victory: $('victory'),
    };
    this.ctx = this.el.mini.getContext('2d');
    this.buildMap();
    this.markerEls = [];
    this.barEls = [];
    this.lagHp = 1;
    this.lastCombo = 0;
    this.toastT = 0; this.flashT = 0;
    this.helpVisible = true;
    this.helpT = 25;
  }

  // Rebuild every on-screen button prompt for the active device (keyboard, Xbox, PlayStation, Switch).
  refreshPrompts(device) {
    this.device = device;
    const rows = document.getElementById('helpRows');
    if (rows) rows.innerHTML = controlRows().map(([a, label]) => `<div>${glyph(a, device)} ${label}</div>`).join('');
    const tc = document.getElementById('titleControls');
    if (tc) tc.innerHTML = TITLE_ROWS.map((a) => `<div>${glyph(a, device)} ${TITLE_LABELS[a]}</div>`).join('');
    const note = document.getElementById('padNote');
    if (note) {
      const conf = device === 'switch' ? glyph('dodge', device) : glyph('jump', device);
      note.innerHTML = device === 'kbm' ? '' : `${DEVICE_NAMES[device]} detected &mdash; ${conf} select &nbsp; ✚ / stick navigate`;
    }
    const ph = document.getElementById('pauseHint');
    if (ph) {
      ph.innerHTML = device === 'kbm' ? 'Arrow keys + Enter, or click &nbsp;·&nbsp; Esc / click to resume'
        : `✚ / stick navigate &nbsp; ${device === 'switch' ? glyph('dodge', device) : glyph('jump', device)} select &nbsp; ◀ ▶ adjust &nbsp; ${glyph('pause', device)} resume`;
    }
  }

  buildMap() {
    const city = this.g.city;
    const s = (this.ms = 0.5);
    const I = L.ISLAND;
    const pad = 300;
    this.mx0 = I.x0 - pad; this.mz0 = I.z0 - pad;
    const w = Math.ceil((I.x1 - I.x0 + pad * 2) * s), h = Math.ceil((I.z1 - I.z0 + pad * 2) * s);
    const c = (this.map = document.createElement('canvas'));
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const X = (x) => (x - this.mx0) * s, Z = (z) => (z - this.mz0) * s;
    g.fillStyle = '#0b1620'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a2d33'; g.fillRect(X(I.x0), Z(I.z0), (I.x1 - I.x0) * s, (I.z1 - I.z0) * s);
    for (let i = 0; i < L.COLS; i++) for (let j = 0; j < L.ROWS; j++) {
      const b = blockRect(i, j);
      g.fillStyle = '#3c4048'; g.fillRect(X(b.x0), Z(b.z0), L.BX * s, L.BZ * s);
    }
    const P = L.PARK_RECT;
    g.fillStyle = '#1f3a22'; g.fillRect(X(P.x0), Z(P.z0), (P.x1 - P.x0) * s, (P.z1 - P.z0) * s);
    for (const t of city.tiers) {
      const v = clamp(60 + t.y1 * 0.6, 60, 210) | 0;
      g.fillStyle = `rgb(${v},${v},${v + 8})`;
      g.fillRect(X(t.x0), Z(t.z0), (t.x1 - t.x0) * s, (t.z1 - t.z0) * s);
    }
    if (city.bridge) { g.fillStyle = '#6d6a66'; g.fillRect(X(city.bridge.x0), Z(city.bridge.zc - 12), (city.bridge.x1 - city.bridge.x0) * s, 24 * s); }
    this.X = X; this.Z = Z;
  }

  update(dt) {
    const g = this.g, p = g.player, el = this.el;
    // health / focus
    const hpk = clamp(p.hp / p.maxHp, 0, 1);
    el.hp.style.width = `${hpk * 100}%`;
    this.lagHp += (hpk - this.lagHp) * Math.min(1, dt * (hpk < this.lagHp ? 1.5 : 10));
    el.hpLag.style.width = `${this.lagHp * 100}%`;
    el.focus.forEach((f, i) => { const v = clamp(p.focus - i, 0, 1); f.style.width = `${v * 100}%`; f.parentElement.classList.toggle('full', v >= 1); });
    el.suit.classList.toggle('black', p.black);
    el.suit.textContent = p.black ? 'SYMBIOTE' : 'CLASSIC';
    el.level.textContent = `LV ${g.level}`;
    el.xp.style.width = `${(g.xp / g.xpNeed) * 100}%`;
    el.time.textContent = g.renderer.cur.name;

    // combo
    if (p.combo >= 2) {
      el.combo.style.opacity = Math.min(1, p.comboT * 1.5);
      el.comboN.textContent = p.combo;
      const w = WORDS.find(([n]) => p.combo >= n);
      el.comboW.textContent = w ? w[1] : '';
    } else el.combo.style.opacity = 0;

    // objective
    const hives = g.city.hives;
    const tot = hives.reduce((a, h) => a + h.maxHp, 0);
    const left = hives.reduce((a, h) => a + (h.alive ? h.hp : 0), 0);
    const pct = Math.round((left / tot) * 100);
    let near = null, nd = Infinity;
    for (const ev of g.encounters.events) {
      if (ev.cleared) continue;
      const d = ev.pos.distanceTo(p.pos);
      if (d < nd) { nd = d; near = ev; }
    }
    el.obj.innerHTML = `<b>SYMBIOTE INFESTATION</b> <span class="pct">${pct}%</span><div class="ibar"><i style="width:${pct}%"></i></div>` +
      (near ? `<div class="sub">${near.label} &middot; ${Math.round(nd)}m</div>` : '');

    // timers
    this.toastT -= dt; this.flashT -= dt;
    el.toast.style.opacity = this.toastT > 0 ? Math.min(1, this.toastT * 2) : 0;
    el.flash.style.opacity = this.flashT > 0 ? Math.min(1, this.flashT * 3) : 0;
    el.sense.style.opacity = p.sense;
    if (this.helpT > 0) { this.helpT -= dt; if (this.helpT <= 0 && this.helpVisible) this.toggleHelp(false); }

    this.updateWorldMarkers();
    this.drawMinimap();
  }

  project(p, out) {
    const cam = this.g.camera;
    _v.copy(p).project(cam);
    const behind = _v.z > 1;
    out.x = (_v.x * 0.5 + 0.5) * innerWidth;
    out.y = (-_v.y * 0.5 + 0.5) * innerHeight;
    out.behind = behind;
    return out;
  }

  updateWorldMarkers() {
    const g = this.g, p = g.player, el = this.el;
    const o = {};
    // zip reticle
    const a = p.aim;
    if (a.valid && a.kind !== 'enemy' && p.state !== 'dead') {
      this.project(a.point, o);
      el.reticle.style.display = o.behind ? 'none' : 'block';
      el.reticle.style.transform = `translate(${o.x}px, ${o.y}px) translate(-50%,-50%) rotate(45deg)`;
      el.reticle.className = a.kind;
    } else el.reticle.style.display = 'none';
    // target lock
    const t = a.enemy || (p.target && p.target.alive && p.inCombat ? p.target : null);
    if (t) {
      this.project(t.chest(new THREE.Vector3()), o);
      el.lock.style.display = o.behind ? 'none' : 'block';
      el.lock.style.transform = `translate(${o.x}px, ${o.y}px) translate(-50%,-50%)`;
    } else el.lock.style.display = 'none';

    // enemy health bars
    let bi = 0;
    for (const e of g.enemies) {
      if (!e.alive || !e.alerted) continue;
      if (e.pos.distanceTo(p.pos) > 30) continue;
      const head = e.chest(new THREE.Vector3()); head.y += 0.85 * e.scale;
      this.project(head, o);
      if (o.behind) continue;
      let b = this.barEls[bi];
      if (!b) { b = document.createElement('div'); b.className = 'ebar'; b.innerHTML = '<i></i><s></s>'; el.bars.appendChild(b); this.barEls.push(b); }
      b.style.display = 'block';
      b.style.transform = `translate(${o.x}px, ${o.y}px) translate(-50%,-50%)`;
      b.firstChild.style.width = `${(e.hp / e.maxHp) * 100}%`;
      b.lastChild.style.width = `${Math.min(1, e.webLevel / (e.heavy ? 6 : 3)) * 100}%`;
      b.classList.toggle('threat', e.threatT >= 0 && e.threatT < 0.45);
      b.classList.toggle('heavy', e.heavy);
      bi++;
    }
    for (let k = bi; k < this.barEls.length; k++) this.barEls[k].style.display = 'none';

    // waypoint markers (clamped to screen edges)
    const evs = g.encounters.events.filter((e) => !e.cleared).map((e) => ({ e, d: e.pos.distanceTo(p.pos) })).sort((a1, b1) => a1.d - b1.d).slice(0, 4);
    evs.forEach(({ e, d }, i) => {
      let m = this.markerEls[i];
      if (!m) { m = document.createElement('div'); m.className = 'marker'; m.innerHTML = '<span class="dia"></span><span class="lbl"></span>'; el.markers.appendChild(m); this.markerEls.push(m); }
      const wp = e.pos.clone(); wp.y += 4;
      this.project(wp, o);
      let x = o.x, y = o.y;
      const W = innerWidth, H = innerHeight, mg = 40;
      if (o.behind) { x = W - x; y = H - mg; }
      const clamped = x < mg || x > W - mg || y < mg || y > H - mg || o.behind;
      x = clamp(x, mg, W - mg); y = clamp(y, mg + 30, H - mg);
      m.style.display = d < 18 ? 'none' : 'block';
      m.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%)`;
      m.className = `marker ${e.type}${clamped ? ' edge' : ''}`;
      m.lastChild.textContent = `${Math.round(d)}m`;
    });
    for (let k = evs.length; k < this.markerEls.length; k++) this.markerEls[k].style.display = 'none';
  }

  drawMinimap() {
    const g = this.g, ctx = this.ctx, p = g.player;
    const W = this.el.mini.width, H = this.el.mini.height;
    const zoom = 1.15;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#0b1620'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    const yaw = g.cam.yaw;
    const ang = -Math.PI / 2 - Math.atan2(Math.cos(yaw), Math.sin(yaw));
    ctx.rotate(ang);
    ctx.scale(zoom, zoom);
    ctx.translate(-this.X(p.pos.x), -this.Z(p.pos.z));
    ctx.drawImage(this.map, 0, 0);
    // events
    for (const ev of g.encounters.events) {
      if (ev.cleared) continue;
      const col = ev.type === 'hive' ? '#ff2a4a' : ev.type === 'outbreak' ? '#b06bff' : '#ffc23d';
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(this.X(ev.pos.x), this.Z(ev.pos.z), ev.type === 'hive' ? 7 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.fillStyle = '#ff4646';
    for (const e of g.enemies) if (e.alive) { ctx.beginPath(); ctx.arc(this.X(e.pos.x), this.Z(e.pos.z), 2.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // player arrow (always points up = camera forward)
    ctx.save();
    ctx.translate(W / 2, H / 2);
    const rel = (p.yawVis - yaw);
    ctx.rotate(-rel);
    ctx.fillStyle = p.black ? '#e9e4ff' : '#ff3b3b';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', W / 2 + Math.sin(-ang + Math.PI) * (W / 2 - 10), H / 2 + Math.cos(-ang + Math.PI) * (W / 2 - 10) + 4);
  }

  comboPulse() {
    const c = this.el.comboN;
    c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  }

  flashText(text, color = '#fff') {
    const f = this.el.flash;
    f.textContent = text; f.style.color = color;
    f.classList.remove('pop'); void f.offsetWidth; f.classList.add('pop');
    this.flashT = 1.3;
  }

  toast(text, t = 3) {
    this.el.toast.innerHTML = text;
    this.toastT = t;
  }

  toggleHelp(v) {
    this.helpVisible = v ?? !this.helpVisible;
    this.el.help.classList.toggle('hidden', !this.helpVisible);
    if (this.helpVisible) this.helpT = 0;
  }

  showDead(v) { this.el.dead.classList.toggle('show', v); }
  showVictory(v) { this.el.victory.classList.toggle('show', v); }
}
