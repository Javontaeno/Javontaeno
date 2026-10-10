import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from './util.js';

const _f = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _hit = {};

export class CameraRig {
  constructor(camera, city) {
    this.cam = camera;
    this.city = city;
    this.yaw = 0;
    this.pitch = 0.18;
    this.dist = 5.5;
    this.curDist = 5.5;
    this.focus = new THREE.Vector3();
    this.fov = 68;
    this.trauma = 0;
    this.roll = 0;
    this.idleLook = 0;
    this.cine = 0; // 0..1 cinematic close-up (finishers)
    this.t = 0;
    this.kickV = new THREE.Vector3(); // decaying positional jolt from heavy hits
    this.punchF = 0; // decaying FOV squeeze
    this.lockW = 0; // 0..1 how much the lock-on target steers the camera
  }

  forwardH(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  rightH(out = new THREE.Vector3()) { return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  shake(a) { this.trauma = Math.min(1, this.trauma + a); }

  recenter(yaw) { this.recenterYaw = yaw; }

  // a short shove along the hit direction, and a quick zoom punch on heavy blows
  kick(dir, amt) { this.kickV.addScaledVector(dir, amt); if (this.kickV.length() > 0.5) this.kickV.setLength(0.5); }
  punch(deg) { this.punchF = Math.min(10, this.punchF + deg); }

  snapBehind(yaw) { this.yaw = yaw; }

  update(dt, player, look) {
    this.t += dt;
    const moving = player.vel.length();
    const fast = player.state === 'swing' || player.state === 'air' || player.state === 'zip';
    if (Math.abs(look.x) + Math.abs(look.y) > 1e-4) this.idleLook = 0; else this.idleLook += dt;
    // lock-on: frame the player and the target together; horizontal look switches targets (main.js)
    const lk = player.lock && player.lock.targetable ? player.lock : null;
    this.lockW += ((lk ? 1 : 0) - this.lockW) * damp(6, dt);
    if (!lk) this.yaw -= look.x;
    if (lk && this.lockW > 0.05) {
      const dx = lk.pos.x - player.pos.x, dz = lk.pos.z - player.pos.z;
      if (dx * dx + dz * dz > 0.5) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 5 * this.lockW, dt);
    }
    this.pitch = clamp(this.pitch + look.y, -1.2, 1.35);
    if (this.recenterYaw !== undefined) {
      this.yaw = dampAngle(this.yaw, this.recenterYaw, 12, dt);
      this.pitch += (0.18 - this.pitch) * damp(12, dt);
      if (Math.abs(((this.recenterYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.02) this.recenterYaw = undefined;
    }
    // assisted follow while traversing fast and not steering the camera
    if (fast && this.idleLook > 0.7 && moving > 12) {
      const vy = Math.atan2(player.vel.x, player.vel.z);
      this.yaw = dampAngle(this.yaw, vy, 1.4, dt);
      this.pitch = this.pitch + (lerp(0.12, 0.32, clamp(-player.vel.y / 30, 0, 1)) - this.pitch) * damp(1.2, dt);
    }

    let want = 5.2;
    if (player.state === 'swing') want = 5.6 + moving * 0.035;
    else if (fast) want = 5.4 + moving * 0.03;
    else if (player.state === 'wall') want = 6.5;
    if (player.inCombat) want = Math.max(want, 6.8);
    if (lk) want = Math.max(want, 6.2 + Math.min(4, Math.hypot(lk.pos.x - player.pos.x, lk.pos.z - player.pos.z) * 0.25));
    want = Math.min(want, 8.5);
    want = lerp(want, 2.6, this.cine);
    this.dist += (want - this.dist) * damp(3, dt);

    const target = _p.copy(player.pos);
    target.y += player.state === 'perch' ? 1.1 : 1.55;
    // locked: shift the focus a little toward the target so both stay in frame
    if (lk) target.lerp(_d.set(lk.pos.x, target.y, lk.pos.z), 0.2 * this.lockW);
    const k = fast ? 16 : 12;
    this.focus.lerp(target, damp(k, dt));
    if (this.focus.distanceTo(target) > 6) this.focus.copy(target);

    const f = this.forward(_f);
    const right = this.rightH(_d);
    // over-the-shoulder offset
    const origin = this.focus.clone().addScaledVector(right, 0.45 * (1 - this.cine));
    const back = f.clone().negate();
    // collide the boom with buildings
    let dist = this.dist;
    const hit = this.city.raycast(origin, back, dist + 0.4, _hit);
    if (hit) dist = Math.max(0.9, hit.t - 0.4);
    if (dist < this.curDist) this.curDist = dist; else this.curDist += (dist - this.curDist) * damp(4, dt);
    const pos = origin.addScaledVector(back, this.curDist);
    if (pos.y < 0.4) pos.y = 0.4;

    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    const t = this.t * 40;
    pos.x += Math.sin(t * 1.1) * s * 0.35;
    pos.y += Math.sin(t * 1.7 + 1) * s * 0.3;
    pos.z += Math.sin(t * 1.3 + 2) * s * 0.35;
    this.kickV.multiplyScalar(Math.exp(-dt * 14));
    pos.add(this.kickV);
    this.cam.position.copy(pos);
    this.cam.lookAt(pos.clone().add(f));

    // banking roll during swings
    let wantRoll = 0;
    if (player.state === 'swing' || (player.state === 'air' && moving > 15)) {
      const rv = player.vel.dot(right);
      wantRoll = clamp(-rv * 0.006, -0.12, 0.12);
    }
    this.roll += (wantRoll - this.roll) * damp(3, dt);
    this.cam.rotateZ(this.roll + Math.sin(t * 0.9) * s * 0.04);

    const wantFov = 66 + clamp((moving - 10) * 0.55, 0, 24) - this.cine * 10;
    this.fov += (wantFov - this.fov) * damp(3, dt);
    this.punchF *= Math.exp(-dt * 10);
    this.cam.fov = this.fov - this.punchF;
    this.cam.updateProjectionMatrix();
  }
}
