import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CU } from './city.js';
import { lerp, smooth, GLSL_NOISE } from './util.js';

// Time-of-day presets. Everything lerps between these.
export const TIMES = {
  dusk: {
    name: 'Dusk', sunEl: 3.5, sunAz: 250, zenith: [0.035, 0.06, 0.17], horizon: [1.0, 0.42, 0.18], sunCol: [1.0, 0.5, 0.25],
    sunI: 2.2, hemiSky: [0.32, 0.36, 0.55], hemiGround: [0.22, 0.14, 0.1], hemiI: 0.9, fog: [0.42, 0.3, 0.32], fogD: 0.0008,
    night: 0.65, lamp: 0.75, stars: 0.15, cloud: [0.9, 0.45, 0.32], cloudAmt: 0.55, exposure: 1.0, rim: [0.4, 0.5, 1.0], rimI: 0.8, glow: 0.15,
  },
  night: {
    name: 'Night', sunEl: 38, sunAz: 140, zenith: [0.006, 0.008, 0.022], horizon: [0.13, 0.06, 0.1], sunCol: [0.55, 0.65, 1.0],
    sunI: 0.75, hemiSky: [0.12, 0.13, 0.22], hemiGround: [0.12, 0.07, 0.06], hemiI: 0.85, fog: [0.07, 0.05, 0.075], fogD: 0.0011,
    night: 1.0, lamp: 1.0, stars: 1.0, cloud: [0.32, 0.18, 0.2], cloudAmt: 0.5, exposure: 1.15, rim: [0.9, 0.25, 0.35], rimI: 1.2, glow: 0.45,
  },
  day: {
    name: 'Day', sunEl: 52, sunAz: 200, zenith: [0.12, 0.3, 0.68], horizon: [0.62, 0.72, 0.85], sunCol: [1.0, 0.95, 0.88],
    sunI: 3.4, hemiSky: [0.55, 0.65, 0.85], hemiGround: [0.3, 0.27, 0.24], hemiI: 1.1, fog: [0.6, 0.67, 0.76], fogD: 0.0006,
    night: 0.0, lamp: 0.0, stars: 0.0, cloud: [1.0, 1.0, 1.0], cloudAmt: 0.45, exposure: 0.9, rim: [1, 1, 1], rimI: 0.3, glow: 0.0,
  },
};
export const TIME_ORDER = ['dusk', 'night', 'day'];

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uStars: { value: 0 }, uCloudCol: { value: new THREE.Color() },
      uCloudAmt: { value: 0.5 }, uTime: CU.uTime, uGlow: { value: 0 }, uIsMoon: { value: 0 }, uFog: { value: new THREE.Color() }, uEnv: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uZenith, uHorizon, uSunCol, uSunDir, uCloudCol, uFog; uniform float uStars, uCloudAmt, uTime, uGlow, uIsMoon, uEnv;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        float t = pow(clamp(h, 0.0, 1.0), 0.45);
        vec3 col = mix(uHorizon, uZenith, t);
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunCol * pow(sd, 6.0) * 0.45 * (1.0 - uIsMoon * 0.8);
        col += uSunCol * pow(sd, 64.0) * 0.8;
        float disc = smoothstep(0.9993, 0.9996, sd) * (1.0 - uEnv);
        if (uIsMoon > 0.5) {
          float crater = vnoise(d * 400.0) * 0.4 + 0.6;
          col += vec3(1.0, 0.97, 0.9) * disc * 3.5 * crater;
        } else col += uSunCol * disc * 30.0;
        // city light pollution near the horizon
        col += vec3(0.5, 0.22, 0.12) * uGlow * exp(-max(h, 0.0) * 9.0) * 0.6;
        // stars
        if (uStars > 0.0 && h > 0.0 && uEnv < 0.5) {
          vec3 sp = d * 220.0; vec3 id = floor(sp); vec3 f = fract(sp) - 0.5;
          float r = h31(id);
          float s = step(0.985, r) * smoothstep(0.32, 0.0, length(f)) * (0.5 + 0.5 * sin(uTime * (2.0 + r * 4.0) + r * 50.0));
          col += vec3(0.9, 0.95, 1.0) * s * uStars * smoothstep(0.0, 0.25, h) * 2.0;
        }
        // clouds on a virtual plane
        if (h > 0.0 && uEnv < 0.5) {
          vec2 uv = d.xz / (h + 0.08) * 1.6 + vec2(uTime * 0.008, uTime * 0.004);
          float c = fbm3(vec3(uv, uTime * 0.01));
          c = smoothstep(0.62 - uCloudAmt * 0.3, 0.95, c + 0.15 * fbm3(vec3(uv * 3.0, 1.0)));
          float lit = pow(sd, 3.0) * 0.8 + 0.4;
          vec3 cc = uCloudCol * lit + vec3(0.6, 0.25, 0.15) * uGlow * 0.4;
          col = mix(col, cc, c * smoothstep(0.0, 0.18, h) * 0.85);
        }
        // melt into the fog colour at the horizon so the world has no seam
        col = mix(uFog, col, smoothstep(-0.02, 0.07, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4500, 48, 24), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

const FXShader = {
  uniforms: {
    tDiffuse: { value: null }, uSpeed: { value: 0 }, uTime: { value: 0 }, uDamage: { value: 0 }, uSlow: { value: 0 },
    uSense: { value: 0 }, uSuit: { value: 0 }, uAspect: { value: 1 }, uFlash: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uSpeed, uTime, uDamage, uSlow, uSense, uSuit, uAspect, uFlash;
    varying vec2 vUv;
    float hh(float n){ return fract(sin(n) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c * vec2(uAspect, 1.0));
      float ca = 0.0015 + uSpeed * 0.006 + uSlow * 0.004;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + c * ca).b;
      // radial motion blur at the edges when moving fast
      float bl = uSpeed * smoothstep(0.25, 0.8, r) * 0.022;
      if (bl > 0.001) {
        vec3 acc = col;
        for (int i = 1; i < 6; i++) acc += texture2D(tDiffuse, vUv - c * bl * float(i)).rgb;
        col = acc / 6.0;
      }
      // speed lines
      float ang = atan(c.y, c.x);
      float seg = floor(ang * 70.0);
      float ln = step(0.965, hh(seg + floor(uTime * 18.0) * 13.0)) * smoothstep(0.42, 0.85, r);
      col += ln * uSpeed * uSpeed * 0.16 * vec3(1.0);
      // slow-motion grade (perfect dodge / finishers)
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, mix(vec3(lum), col * vec3(0.8, 0.9, 1.25), 0.35), uSlow * 0.7);
      // symbiote suit: subtle cold, contrasty grade
      col = mix(col, pow(col, vec3(1.08)) * vec3(0.95, 0.92, 1.05), uSuit * 0.5);
      // spider-sense pulse
      float ring = smoothstep(0.35, 0.75, r) * uSense;
      col += vec3(1.0, 0.35, 0.1) * ring * 0.35;
      // damage
      col = mix(col, col * vec3(1.4, 0.35, 0.3) + vec3(0.12, 0.0, 0.0), uDamage * smoothstep(0.2, 0.8, r));
      col += uFlash * vec3(1.0, 0.95, 0.9);
      // vignette + grain
      col *= 1.0 - smoothstep(0.45, 1.05, r) * 0.6;
      col += (hh(dot(vUv, vec2(12.9898, 78.233)) + uTime) - 0.5) * 0.018;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Renderer {
  constructor(canvas, quality) {
    this.quality = quality; // 0 low, 1 medium, 2 high
    const r = (this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, [0.75, 1, 1.5][quality]));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 6000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.001);

    this.sky = makeSky();
    this.scene.add(this.sky);
    this.skyScene = new THREE.Scene();
    this.skyForEnv = makeSky();
    this.skyForEnv.material = this.sky.material;
    this.skyScene.add(this.skyForEnv);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envRT = null;

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    const sm = [1024, 2048, 4096][quality];
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.sun, this.sun.target);
    this.rim = new THREE.DirectionalLight(0x6688ff, 0.8);
    this.scene.add(this.rim, this.rim.target);
    this.hemi = new THREE.HemisphereLight(0x8899bb, 0x332211, 0.9);
    this.scene.add(this.hemi);
    // cutscene key light: always in the scene (adding lights later would recompile every material), only lit during dialogue
    this.key = new THREE.DirectionalLight(0xfff1e0, 0);
    this.scene.add(this.key, this.key.target);

    // post-processing chain
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality >= 1 ? 4 : 0 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.45, 1.0);
    this.composer.addPass(this.bloom);
    this.fx = new ShaderPass(FXShader);
    this.composer.addPass(this.fx);
    this.composer.addPass(new OutputPass());

    this.cur = structuredClone(TIMES.dusk);
    this.from = structuredClone(TIMES.dusk);
    this.target = TIMES.dusk;
    this.timeKey = 'dusk';
    this.blend = 1;
    this.envDirty = true;
    this.envTimer = 0;
    this.applyTime(1);
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.r.setSize(w, h);
    this.composer.setSize(w, h);
    this.fx.uniforms.uAspect.value = w / h;
  }

  setTime(key) {
    this.from = structuredClone(this.cur);
    this.target = TIMES[key];
    this.timeKey = key;
    this.blend = 0;
  }

  applyTime(k) {
    const c = this.cur, f = this.from, t = this.target;
    for (const key of Object.keys(t)) {
      if (key === 'name') { c.name = t.name; continue; }
      const a = f[key], b = t[key];
      if (Array.isArray(b)) c[key] = a.map((v, i) => lerp(v, b[i], k));
      else c[key] = lerp(a, b, k);
    }
    const el = (c.sunEl * Math.PI) / 180, az = (c.sunAz * Math.PI) / 180;
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    const u = this.sky.material.uniforms;
    u.uZenith.value.setRGB(...c.zenith); u.uHorizon.value.setRGB(...c.horizon); u.uSunCol.value.setRGB(...c.sunCol);
    u.uSunDir.value.copy(this.sunDir); u.uStars.value = c.stars; u.uCloudCol.value.setRGB(...c.cloud);
    u.uCloudAmt.value = c.cloudAmt; u.uGlow.value = c.glow; u.uIsMoon.value = c.night > 0.85 ? 1 : 0;
    this.sun.color.setRGB(...c.sunCol); this.sun.intensity = c.sunI;
    this.hemi.color.setRGB(...c.hemiSky); this.hemi.groundColor.setRGB(...c.hemiGround); this.hemi.intensity = c.hemiI;
    this.rim.color.setRGB(...c.rim); this.rim.intensity = c.rimI;
    const fogC = new THREE.Color().setRGB(...c.horizon).multiplyScalar(0.82).add(new THREE.Color().setRGB(...c.zenith).multiplyScalar(0.18));
    this.scene.fog.color.copy(fogC); this.scene.fog.density = c.fogD;
    u.uFog.value.copy(fogC);
    this.r.toneMappingExposure = c.exposure;
    CU.uNight.value = c.night; CU.uLamp.value = c.lamp;
    this.envDirty = true;
  }

  update(dt, focus) {
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt * 0.45);
      this.applyTime(smooth(this.blend));
    }
    this.envTimer -= dt;
    if (this.envDirty && this.envTimer <= 0) {
      if (this.envRT) this.envRT.dispose();
      this.skyForEnv.position.set(0, 0, 0);
      this.sky.material.uniforms.uEnv.value = 1;
      this.envRT = this.pmrem.fromScene(this.skyScene, 0, 1, 5000);
      this.sky.material.uniforms.uEnv.value = 0;
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.55 + (1 - this.cur.night) * 0.5;
      this.envDirty = false;
      this.envTimer = 0.4;
    }
    this.sky.position.copy(this.camera.position);
    // shadow frustum follows the player, snapped to texels to stop shimmering
    const sd = this.sunDir;
    const texel = 180 / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + sd.x * 400, focus.y + sd.y * 400, fz + sd.z * 400);
    this.rim.target.position.copy(focus);
    this.rim.position.set(focus.x - sd.x * 100, focus.y + 60, focus.z - sd.z * 100);
  }

  render() {
    this.composer.render();
  }
}
