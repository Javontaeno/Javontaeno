// Unified keyboard / mouse / gamepad input, exposed as named actions.
// Gamepads are normalised to the W3C "standard" layout (Xbox, PlayStation, Switch Pro and generic pads),
// with best-effort remapping for browsers that report a non-standard layout.
import { SETTINGS } from './settings.js';
import { PAD } from './controls.js';

const BIND = {
  jump: ['Space'],
  swing: ['ShiftLeft', 'ShiftRight'],
  attack: ['M0', 'KeyJ'],
  web: ['M2', 'KeyK'],
  zip: ['KeyE'],
  dash: ['KeyQ'],
  dodge: ['KeyC', 'KeyL'],
  finisher: ['KeyF'],
  heal: ['KeyH'],
  suit: ['KeyR'],
  bomb: ['KeyG'],
  time: ['KeyT'],
  mute: ['KeyM'],
  help: ['KeyI'],
  recenter: ['KeyV'],
  lockon: ['Tab', 'M1'],
  callin: ['KeyX'],
  pause: ['Escape', 'KeyP'],
};
const MENU_KEYS = { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], confirm: ['Enter', 'Space'], back: ['Escape', 'Backspace'] };

export function padKind(id = '') {
  const s = id.toLowerCase();
  // Xbox first: its pads also call themselves "Wireless Controller"
  if (/045e|xbox|xinput|microsoft/.test(s)) return 'xbox';
  if (/054c|playstation|dualshock|dualsense|wireless controller|ps4|ps5|sony/.test(s)) return 'ps';
  if (/057e|nintendo|pro controller|joy-con/.test(s)) return 'switch';
  return 'generic';
}

const bv = (b) => (b ? (b.value > 0 ? b.value : b.pressed ? 1 : 0) : 0);
function decodeHat(v, out) {
  // D-pad reported as a single "hat" axis (common on non-standard Sony layouts)
  if (v === undefined || v > 1.05 || v < -1.05) return;
  const near = (a) => Math.abs(v - a) < 0.08;
  if (near(-1) || near(-0.714) || near(1)) out[12] = 1;
  if (near(-0.714) || near(-0.428) || near(-0.142)) out[15] = 1;
  if (near(-0.142) || near(0.142) || near(0.428)) out[13] = 1;
  if (near(0.428) || near(0.714) || near(1)) out[14] = 1;
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.holdT = {};
    this.mdx = 0; this.mdy = 0;
    this.locked = false;
    this.virtual = null; // scripted input for automated tests
    this.device = 'kbm';
    this.padIndex = -1;
    this.padKind = 'generic';
    this.padB = new Array(17).fill(0); this.padPrevB = new Array(17).fill(0);
    this.padMove = { x: 0, y: 0 };
    this.padLook = { x: 0, y: 0 };
    this.padHold = {};
    this.calib = {};
    this.stickPrev = { x: 0, y: 0 };
    this.stickRepeat = 0;
    this.menuEdges = {};

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.setDevice('kbm');
      this.press(e.code);
    });
    addEventListener('keyup', (e) => this.release(e.code));
    addEventListener('blur', () => { for (const k of [...this.down]) this.release(k); });
    canvas.addEventListener('mousedown', (e) => { this.setDevice('kbm'); this.press('M' + e.button); e.preventDefault(); });
    addEventListener('mouseup', (e) => this.release('M' + e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX; this.mdy += e.movementY;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.setDevice('kbm');
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLockChange && this.onLockChange(this.locked);
    });
    addEventListener('gamepadconnected', (e) => {
      this.padIndex = e.gamepad.index;
      this.padKind = padKind(e.gamepad.id);
      this.calib = {};
      this.onPadConnect && this.onPadConnect(this.padKind, e.gamepad);
    });
    addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this.padIndex) {
        this.padIndex = -1;
        this.padB.fill(0); this.padPrevB.fill(0);
        if (this.device !== 'kbm') this.setDevice('kbm');
        this.onPadDisconnect && this.onPadDisconnect();
      }
    });
  }

  get usingPad() { return this.device !== 'kbm'; }

  setDevice(d) {
    if (d === this.device) return;
    this.device = d;
    this.onDeviceChange && this.onDeviceChange(d);
  }

  lock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => { try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch { /* needs a user gesture */ } }); } catch { /* needs a user gesture */ }
    }
  }

  press(code) { if (!this.down.has(code)) { this.down.add(code); this.pressedSet.add(code); this.holdT[code] = 0; } }
  release(code) { if (this.down.has(code)) { this.down.delete(code); this.releasedSet.add(code); } }

  codes(a) { return BIND[a] || []; }
  padDown(a) { const i = PAD[a]; return i !== undefined && this.padB[i] > 0.4; }
  padEdge(a, on) { const i = PAD[a]; if (i === undefined) return false; const now = this.padB[i] > 0.4, was = this.padPrevB[i] > 0.4; return on ? now && !was : !now && was; }

  held(a) {
    if (this.virtual) return !!this.virtual.held?.[a];
    return this.codes(a).some((c) => this.down.has(c)) || this.padDown(a);
  }
  pressed(a) {
    if (this.virtual) return !!this.virtual.pressed?.[a];
    return this.codes(a).some((c) => this.pressedSet.has(c)) || this.padEdge(a, true);
  }
  released(a) {
    if (this.virtual) return !!this.virtual.released?.[a];
    return this.codes(a).some((c) => this.releasedSet.has(c)) || this.padEdge(a, false);
  }
  holdTime(a) {
    if (this.virtual) return (this.virtual.holdT && this.virtual.holdT[a]) || 0;
    let t = 0;
    for (const c of this.codes(a)) if (this.holdT[c] !== undefined && this.down.has(c)) t = Math.max(t, this.holdT[c]);
    if (this.padHold[a]) t = Math.max(t, this.padHold[a]);
    return t;
  }

  // Edge-triggered menu navigation from keyboard, d-pad or left stick.
  menu(name) {
    if (this.menuEdges[name]) return true;
    return (MENU_KEYS[name] || []).some((c) => this.pressedSet.has(c));
  }

  get move() {
    if (this.virtual) return this.virtual.move || { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) y += 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) y -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) x += 1;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    if (Math.hypot(this.padMove.x, this.padMove.y) > Math.hypot(x, y)) return this.padMove;
    return { x, y };
  }

  look(dt) {
    if (this.virtual) return this.virtual.look || { x: 0, y: 0 };
    const inv = SETTINGS.invertY ? -1 : 1, s = SETTINGS.sens;
    const out = { x: this.mdx * 0.0022 * s, y: this.mdy * 0.0022 * s * inv };
    // expo curve: precise near the centre, fast at full tilt
    const cx = Math.sign(this.padLook.x) * Math.pow(Math.abs(this.padLook.x), 1.7);
    const cy = Math.sign(this.padLook.y) * Math.pow(Math.abs(this.padLook.y), 1.7);
    out.x += cx * 3.2 * s * dt;
    out.y += cy * 2.2 * s * inv * dt;
    return out;
  }

  // Analog trigger reported on an axis that rests at -1 (only trusted once we've seen it rest low).
  trigAxis(gp, i) {
    const v = gp.axes[i];
    if (v === undefined) return 0;
    if (v < -0.6) this.calib[i] = true;
    return this.calib[i] ? Math.max(0, (v + 1) / 2) : 0;
  }

  readPad(gp) {
    const B = this.padB, kind = this.padKind;
    B.fill(0);
    const ax = (i) => gp.axes[i] || 0;
    let lx, ly, rx, ry;
    if (gp.mapping === 'standard' || kind === 'generic' || kind === 'switch') {
      for (let i = 0; i < 17; i++) B[i] = bv(gp.buttons[i]);
      lx = ax(0); ly = ax(1); rx = ax(2); ry = ax(3);
    } else if (kind === 'ps') {
      // DualShock / DualSense on browsers without the standard mapping: □ ✕ ○ △ order, right stick on axes 2 & 5
      B[0] = bv(gp.buttons[1]); B[1] = bv(gp.buttons[2]); B[2] = bv(gp.buttons[0]); B[3] = bv(gp.buttons[3]);
      for (let i = 4; i < 12; i++) B[i] = bv(gp.buttons[i]);
      B[16] = bv(gp.buttons[12]);
      B[6] = Math.max(B[6], this.trigAxis(gp, 3)); B[7] = Math.max(B[7], this.trigAxis(gp, 4));
      lx = ax(0); ly = ax(1); rx = ax(2); ry = ax(5);
      if (gp.axes.length > 9) decodeHat(gp.axes[9], B);
    } else {
      // Xbox pads on Linux/Firefox (xpad layout)
      for (let i = 0; i < 6; i++) B[i] = bv(gp.buttons[i]);
      B[8] = bv(gp.buttons[6]); B[9] = bv(gp.buttons[7]); B[16] = bv(gp.buttons[8]); B[10] = bv(gp.buttons[9]); B[11] = bv(gp.buttons[10]);
      B[6] = this.trigAxis(gp, 2); B[7] = this.trigAxis(gp, 5);
      lx = ax(0); ly = ax(1); rx = ax(3); ry = ax(4);
      if (gp.axes.length > 7) { B[14] = ax(6) < -0.5 ? 1 : 0; B[15] = ax(6) > 0.5 ? 1 : 0; B[12] = ax(7) < -0.5 ? 1 : 0; B[13] = ax(7) > 0.5 ? 1 : 0; }
    }
    // radial deadzone, rescaled so movement starts from zero
    const dz = (x, y, d) => {
      const m = Math.hypot(x, y);
      if (m < d) return { x: 0, y: 0 };
      const k = Math.min(1, (m - d) / (1 - d)) / m;
      return { x: x * k, y: y * k };
    };
    const mv = dz(lx, ly, 0.16), lk = dz(rx, ry, 0.12);
    this.padMove = { x: mv.x, y: -mv.y };
    this.padLook = lk;
  }

  pollPad(dt) {
    this.padPrevB = this.padB.slice();
    this.menuEdges = {};
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = this.padIndex >= 0 ? pads[this.padIndex] : null;
    if (!gp || !gp.connected) {
      gp = [...pads].find((p) => p && p.connected) || null;
      if (gp) { this.padIndex = gp.index; this.padKind = padKind(gp.id); }
    }
    if (!gp) { this.padB.fill(0); this.padMove = { x: 0, y: 0 }; this.padLook = { x: 0, y: 0 }; return; }
    this.readPad(gp);
    const B = this.padB;
    let active = false;
    for (let i = 0; i < 17; i++) if (B[i] > 0.5) active = true;
    if (Math.hypot(this.padMove.x, this.padMove.y) > 0.3 || Math.hypot(this.padLook.x, this.padLook.y) > 0.3) active = true;
    if (active) this.setDevice(this.padKind);
    for (const a of Object.keys(PAD)) this.padHold[a] = this.padDown(a) ? (this.padHold[a] || 0) + dt : 0;
    // menu edges: d-pad, left stick (with auto-repeat), confirm/back respecting Nintendo's A/B layout
    const edge = (i) => B[i] > 0.5 && !(this.padPrevB[i] > 0.5);
    const conf = this.padKind === 'switch' ? 1 : 0, back = this.padKind === 'switch' ? 0 : 1;
    const E = this.menuEdges;
    if (edge(12)) E.up = true; if (edge(13)) E.down = true; if (edge(14)) E.left = true; if (edge(15)) E.right = true;
    if (edge(conf)) E.confirm = true; if (edge(back)) E.back = true; if (edge(9)) E.start = true;
    const sx = this.padMove.x, sy = this.padMove.y;
    const dir = Math.abs(sy) > 0.6 ? (sy > 0 ? 'up' : 'down') : Math.abs(sx) > 0.6 ? (sx > 0 ? 'right' : 'left') : null;
    this.stickRepeat -= dt;
    if (dir && (dir !== this.stickDir || this.stickRepeat <= 0)) { E[dir] = true; this.stickRepeat = dir !== this.stickDir ? 0.4 : 0.14; }
    this.stickDir = dir;
  }

  rumble(strong, weak, ms) {
    if (!SETTINGS.vibration || this.padIndex < 0 || !this.usingPad) return;
    const gp = navigator.getGamepads ? navigator.getGamepads()[this.padIndex] : null;
    if (!gp) return;
    try {
      const act = gp.vibrationActuator;
      if (act && act.playEffect) { const p = act.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }); if (p && p.catch) p.catch(() => {}); }
      else if (gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse) gp.hapticActuators[0].pulse(Math.min(1, Math.max(strong, weak)), ms);
    } catch { /* haptics unsupported */ }
  }

  tick(dt) {
    for (const c of this.down) this.holdT[c] = (this.holdT[c] || 0) + dt;
  }

  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.mdx = 0; this.mdy = 0;
    if (this.virtual) { this.virtual.pressed = {}; this.virtual.released = {}; this.virtual.look = { x: 0, y: 0 }; }
  }
}
