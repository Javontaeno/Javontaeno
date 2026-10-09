// Unified keyboard / mouse / gamepad input, exposed as named actions.
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
  pause: ['Escape', 'KeyP'],
};
const PAD = { jump: 0, dodge: 1, attack: 2, web: 3, zip: 4, dash: 5, finisher: 6, swing: 7, suit: 12, heal: 13, bomb: 14, time: 15, pause: 9 };

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.holdT = {};
    this.mdx = 0; this.mdy = 0;
    this.sens = 0.0022;
    this.locked = false;
    this.virtual = null; // scripted input for automated tests
    this.padPrev = {};
    this.padMove = { x: 0, y: 0 };
    this.padLook = { x: 0, y: 0 };
    this.usingPad = false;

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.press(e.code);
    });
    addEventListener('keyup', (e) => this.release(e.code));
    addEventListener('blur', () => { for (const k of [...this.down]) this.release(k); });
    canvas.addEventListener('mousedown', (e) => { this.press('M' + e.button); e.preventDefault(); });
    addEventListener('mouseup', (e) => this.release('M' + e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX; this.mdy += e.movementY;
      this.usingPad = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLockChange && this.onLockChange(this.locked);
    });
  }

  lock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => this.canvas.requestPointerLock()); } catch { this.canvas.requestPointerLock(); }
    }
  }

  press(code) { if (!this.down.has(code)) { this.down.add(code); this.pressedSet.add(code); this.holdT[code] = 0; } }
  release(code) { if (this.down.has(code)) { this.down.delete(code); this.releasedSet.add(code); } }

  codes(a) { return BIND[a] || []; }
  held(a) {
    if (this.virtual) return !!this.virtual.held?.[a];
    if (this.codes(a).some((c) => this.down.has(c))) return true;
    return !!this.padDown?.[a];
  }
  pressed(a) {
    if (this.virtual) return !!this.virtual.pressed?.[a];
    if (this.codes(a).some((c) => this.pressedSet.has(c))) return true;
    return !!this.padPressed?.[a];
  }
  released(a) {
    if (this.virtual) return !!this.virtual.released?.[a];
    if (this.codes(a).some((c) => this.releasedSet.has(c))) return true;
    return !!this.padReleased?.[a];
  }
  holdTime(a) {
    let t = 0;
    for (const c of this.codes(a)) if (this.holdT[c] !== undefined && this.down.has(c)) t = Math.max(t, this.holdT[c]);
    if (this.padHold?.[a]) t = Math.max(t, this.padHold[a]);
    return t;
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
    const out = { x: this.mdx * this.sens, y: this.mdy * this.sens };
    out.x += this.padLook.x * 2.8 * dt;
    out.y += this.padLook.y * 2.0 * dt;
    return out;
  }

  pollPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    this.padDown = {}; this.padPressed = {}; this.padReleased = {}; this.padHold = this.padHold || {};
    this.padMove = { x: 0, y: 0 }; this.padLook = { x: 0, y: 0 };
    if (!gp) return;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    this.padMove = { x: dz(gp.axes[0] || 0), y: -dz(gp.axes[1] || 0) };
    this.padLook = { x: dz(gp.axes[2] || 0), y: dz(gp.axes[3] || 0) };
    for (const [a, i] of Object.entries(PAD)) {
      const b = gp.buttons[i];
      const d = !!b && (b.pressed || b.value > 0.4);
      if (d) { this.padDown[a] = true; this.padHold[a] = (this.padHold[a] || 0) + dt; this.usingPad = true; }
      if (d && !this.padPrev[a]) this.padPressed[a] = true;
      if (!d && this.padPrev[a]) { this.padReleased[a] = true; }
      if (!d) this.padHold[a] = 0;
      this.padPrev[a] = d;
    }
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
