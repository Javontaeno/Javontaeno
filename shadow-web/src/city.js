import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, clamp, lerp, GLSL_NOISE } from './util.js';

// ---------------------------------------------------------------------------
// Layout: a Manhattan-style grid. Avenues run north-south (z), streets east-west (x).
// ---------------------------------------------------------------------------
export const L = { AVE: 22, ST: 16, BX: 84, BZ: 52, COLS: 9, ROWS: 16, SW: 3.5, EDGE: 26 };
L.PX = L.BX + L.AVE;
L.PZ = L.BZ + L.ST;
L.W = L.COLS * L.PX + L.AVE;
L.D = L.ROWS * L.PZ + L.ST;
L.X0 = -L.W / 2;
L.Z0 = -L.D / 2;
L.PARK = { i0: 3, i1: 5, j0: 1, j1: 4 };
L.ISLAND = { x0: L.X0 - L.EDGE, x1: -L.X0 + L.EDGE, z0: L.Z0 - L.EDGE, z1: -L.Z0 + L.EDGE };
L.WATER_Y = -1.6;

export function blockRect(i, j) {
  const x0 = L.X0 + L.AVE + i * L.PX;
  const z0 = L.Z0 + L.ST + j * L.PZ;
  return { x0, z0, x1: x0 + L.BX, z1: z0 + L.BZ };
}
const isParkBlock = (i, j) => i >= L.PARK.i0 && i <= L.PARK.i1 && j >= L.PARK.j0 && j <= L.PARK.j1;
const PARK_RECT = (() => {
  const a = blockRect(L.PARK.i0, L.PARK.j0), b = blockRect(L.PARK.i1, L.PARK.j1);
  return { x0: a.x0, z0: a.z0, x1: b.x1, z1: b.z1 };
})();
L.PARK_RECT = PARK_RECT;

// Shared uniforms that time-of-day / gameplay drive every frame.
export const CU = {
  uTime: { value: 0 },
  uNight: { value: 1 },
  uLamp: { value: 1 },
  uWinI: { value: 1.0 },
  uHives: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 0)) },
};

// ---------------------------------------------------------------------------
// Building facade material: windows, storefronts, billboards and symbiote goo are
// all procedural, computed per-pixel from world position — no textures needed.
// ---------------------------------------------------------------------------
function makeBuildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, CU);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aColor; attribute vec4 aBld; attribute vec4 aExt;
        varying vec3 vWP; varying vec3 vWN; varying vec3 vCol; varying vec4 vB; varying vec4 vE;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 _wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          _wp = instanceMatrix * _wp;
        #endif
        _wp = modelMatrix * _wp; vWP = _wp.xyz; vWN = normal;
        vCol = aColor; vB = aBld; vE = aExt;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; varying vec3 vWN; varying vec3 vCol; varying vec4 vB; varying vec4 vE;
        uniform float uTime; uniform float uNight; uniform float uWinI; uniform vec4 uHives[8];
        ${GLSL_NOISE}`)
      .replace('#include <color_fragment>', /* glsl */ `
        vec3 N = normalize(vWN);
        float style = vB.x, seed = vB.y, litF = vB.z, topY = vB.w;
        float baseY = vE.x, floorH = vE.y, bayW = vE.z, bill = vE.w;
        vec3 bAlb = vCol; float bRough = 0.85; float bMetal = 0.0; vec3 bEmis = vec3(0.0);
        float hgt = vWP.y;
        if (N.y > 0.5) {
          float n = vnoise(vWP * 0.9) * 0.6 + vnoise(vWP * 0.13) * 0.4;
          bAlb = vec3(0.13, 0.125, 0.12) * (0.7 + 0.55 * n);
          vec2 g = abs(fract(vWP.xz / 6.0) - 0.5);
          bAlb *= 1.0 - 0.25 * smoothstep(0.46, 0.5, max(g.x, g.y));
          bRough = 0.93;
        } else if (N.y < -0.5) {
          bAlb = vCol * 0.3;
        } else {
          float fx = abs(N.x) > 0.5 ? vWP.z * sign(N.x) : -vWP.x * sign(N.z);
          vec2 cell = vec2(fx / bayW, hgt / floorH);
          vec2 cid = floor(cell); vec2 f = fract(cell);
          vec2 fw = fwidth(cell);
          float lod = smoothstep(0.15, 0.55, max(fw.x, fw.y));
          vec4 wr;
          if (style < 0.5) wr = vec4(0.05, 0.95, 0.1, 0.96);
          else if (style < 1.5) wr = vec4(0.13, 0.87, 0.22, 0.86);
          else if (style < 2.5) wr = vec4(0.27, 0.73, 0.22, 0.8);
          else wr = vec4(0.3, 0.7, 0.1, 0.92);
          vec2 e = max(fw, vec2(0.002)) * 0.8;
          float wx = smoothstep(wr.x - e.x, wr.x + e.x, f.x) * (1.0 - smoothstep(wr.y - e.x, wr.y + e.x, f.x));
          float wy = smoothstep(wr.z - e.y, wr.z + e.y, f.y) * (1.0 - smoothstep(wr.w - e.y, wr.w + e.y, f.y));
          float cover = (wr.y - wr.x) * (wr.w - wr.z);
          float win = mix(wx * wy, cover, lod);

          vec3 fac = vCol * (0.84 + 0.32 * vnoise(vWP * 0.6));
          if (style > 1.5 && style < 2.5) {
            // running-bond brick, faded out with distance to avoid shimmer
            vec2 bc = vec2(fx / 0.42, hgt / 0.16);
            bc.x += step(1.0, mod(floor(bc.y), 2.0)) * 0.5;
            vec2 bf = fract(bc);
            vec2 bw = fwidth(bc);
            float mortar = 1.0 - smoothstep(0.0, bw.y * 1.5 + 0.06, bf.y) * smoothstep(0.0, bw.x * 1.5 + 0.04, bf.x);
            float bfade = 1.0 - smoothstep(0.3, 0.9, max(bw.x, bw.y));
            fac *= 1.0 - mortar * 0.35 * bfade;
            fac *= 0.9 + 0.2 * fract(sin(dot(floor(bc), vec2(12.9898, 78.233))) * 43758.5) * bfade;
          } else if (style > 2.5) {
            // art-deco vertical piers
            float pier = smoothstep(0.24, 0.27, abs(f.x - 0.5));
            fac *= mix(1.0, 1.12, pier * (1.0 - lod));
          } else if (style < 0.5) {
            fac = vCol * 0.9;
          }
          // floor slabs / spandrels
          float slab = 1.0 - smoothstep(0.0, 0.06 + fw.y, f.y);
          fac *= 1.0 - 0.18 * slab * (1.0 - lod) * step(0.5, style);

          // window interiors
          vec2 faceId = vec2(step(0.5, N.x) - step(N.x, -0.5), step(0.5, N.z) - step(N.z, -0.5));
          float r1 = fract(sin(dot(cid + vec2(seed * 17.13, faceId.x * 3.1 + faceId.y * 7.7), vec2(127.1, 311.7))) * 43758.5453);
          float r2 = fract(sin(dot(cid.yx * 1.7 + seed * 3.1, vec2(269.5, 183.3))) * 43758.5453);
          float floorLit = step(0.93, fract(sin(cid.y * 91.7 + seed * 13.0) * 4375.5));
          float litThresh = litF * (0.12 + 0.88 * uNight);
          float isLit = max(step(r1, litThresh), floorLit * step(0.4, uNight));
          vec3 litCol = mix(vec3(1.0, 0.68, 0.38), vec3(0.72, 0.86, 1.0), step(0.72, r2));
          litCol = mix(litCol, vec3(1.0, 0.86, 0.6), step(0.9, r2));
          float blind = mix(1.0, 0.25 + 0.75 * step(f.y, 0.35 + 0.55 * fract(r2 * 7.3)), step(0.55, fract(r1 * 5.1)));
          float edgeDark = smoothstep(0.0, 0.18, min(min(f.x - wr.x, wr.y - f.x), min(f.y - wr.z, wr.w - f.y)));
          vec3 glass = style < 0.5 ? mix(vec3(0.02, 0.05, 0.07), vec3(0.05, 0.07, 0.06), step(0.5, fract(seed * 7.0))) : vec3(0.02, 0.025, 0.03);
          vec3 wEm = isLit * litCol * (0.35 + 0.9 * r2 * r2) * blind * (0.4 + 0.6 * edgeDark);
          vec3 wEmAvg = litCol * litThresh * 0.55;
          wEm = mix(wEm, wEmAvg, lod) * uWinI;

          float topBand = smoothstep(topY - 1.4, topY - 1.2, hgt);
          float baseBand = (1.0 - step(0.5, baseY)) * (1.0 - smoothstep(4.4, 4.6, hgt));
          win *= (1.0 - topBand) * (1.0 - baseBand);
          fac = mix(fac, vCol * 1.18, topBand);

          bAlb = mix(fac, glass, win);
          bRough = mix(style < 0.5 ? 0.45 : 0.85, 0.04 + 0.08 * r2, win);
          bMetal = mix(style < 0.5 ? 0.5 : 0.0, mix(style < 0.5 ? 0.9 : 0.7, 0.2, isLit), win);
          float room = (0.25 + 0.75 * fract(r1 * 13.7)) * (1.0 - isLit) * (0.3 + 0.7 * smoothstep(wr.z, wr.w, f.y));
          bEmis = wEm * win + win * room * vec3(0.05, 0.045, 0.06) * (0.3 + uNight) * (1.0 - lod);

          // street-level storefronts with lit interiors and neon signage
          if (baseBand > 0.5) {
            float sx = fx / 6.0; float sf = fract(sx); vec2 sid = vec2(floor(sx), seed * 11.0);
            float shop = step(0.07, sf) * step(sf, 0.93) * step(0.25, hgt) * step(hgt, 3.3);
            float signB = step(3.55, hgt) * step(hgt, 4.35) * step(0.05, sf) * step(sf, 0.95);
            float hs1 = fract(sin(dot(sid, vec2(7.1, 3.7))) * 437.5), hs2 = fract(sin(dot(sid, vec2(3.3, 9.1))) * 917.3);
            vec3 signCol = 0.5 + 0.5 * cos(6.2831 * (hs1 + vec3(0.0, 0.33, 0.67)));
            float hasSign = step(0.35, hs2);
            // shop glazing: mullions, a transom, and an interior with shelves and ceiling lights
            float mull = step(0.47, abs(fract(fx / 1.5) - 0.5)) + step(abs(hgt - 2.55), 0.04);
            float shelves = smoothstep(0.35, 0.65, vnoise(vec3(fx * 1.3, floor(hgt / 0.55) * 3.1, seed * 7.0))) * step(hgt, 2.3);
            float open_ = step(0.18, hs2);
            vec3 inter = mix(vec3(1.0, 0.72, 0.42), vec3(0.75, 0.9, 1.0), step(0.6, hs1));
            float ceil_ = smoothstep(1.2, 3.1, hgt);
            vec3 shopEm = inter * (0.06 + 0.32 * ceil_) * (1.0 - shelves * 0.75) * open_ * (0.35 + 0.9 * uNight);
            bAlb = mix(vCol * 0.55, vec3(0.012, 0.014, 0.016), max(shop, signB));
            bAlb = mix(bAlb, vec3(0.05), shop * mull);
            bRough = mix(0.7, 0.05, shop * (1.0 - mull)); bMetal = shop * (1.0 - mull) * 0.7;
            bEmis = shop * (1.0 - mull) * shopEm
                  + signB * hasSign * signCol * (0.35 + 1.4 * uNight) * (0.85 + 0.15 * sin(uTime * 3.0 + hs1 * 40.0));
            // roller shutters on closed shops
            if (open_ < 0.5) { float rib = 0.6 + 0.4 * step(0.5, fract(hgt * 8.0)); bAlb = mix(bAlb, vec3(0.32, 0.33, 0.34) * rib, shop); bMetal = shop * 0.6; bRough = mix(bRough, 0.4, shop); }
          }
          // animated billboards (a Times Square-style district)
          if (bill > 0.5 && hgt > 6.0 && hgt < 30.0) {
            vec2 pc = vec2(fx / 11.0, (hgt - 6.0) / 8.0); vec2 pid = floor(pc); vec2 pf = fract(pc);
            float panel = step(0.06, pf.x) * step(pf.x, 0.94) * step(0.08, pf.y) * step(pf.y, 0.92);
            float ph = fract(sin(dot(pid + seed, vec2(41.3, 17.9))) * 9137.1);
            vec3 c1 = 0.5 + 0.5 * cos(6.2831 * (ph + vec3(0.0, 0.33, 0.67)));
            vec3 c2 = 0.5 + 0.5 * cos(6.2831 * (ph + 0.5 + vec3(0.0, 0.33, 0.67)));
            float pat = step(0.5, fract(pf.x * 3.0 + pf.y * 2.0 * sign(ph - 0.5) - uTime * (0.2 + ph * 0.5)));
            float flick = 0.75 + 0.25 * sin(uTime * (1.0 + ph * 3.0) + ph * 20.0);
            vec3 img = mix(c1, c2, pat) * flick;
            bAlb = mix(bAlb, vec3(0.02), panel);
            bRough = mix(bRough, 0.3, panel);
            bEmis = mix(bEmis, img * 2.2, panel);
          }
        }
        // symbiote infestation creeping down from the hives
        float goo = 0.0;
        for (int i = 0; i < 8; i++) {
          vec4 hv = uHives[i];
          if (hv.w <= 0.0) continue;
          vec3 d = (vWP - hv.xyz) * vec3(1.0, 0.5, 1.0);
          float d0 = length(d);
          if (d0 > hv.w * 1.55) continue; // cheap reject before the noise
          float dist = d0 + (fbm3(vWP * 0.11 + float(i) * 3.7) - 0.5) * hv.w * 1.0;
          goo = max(goo, 1.0 - smoothstep(hv.w * 0.5, hv.w, dist));
        }
        if (goo > 0.001) {
          float vein = fbm3(vWP * 0.55 + vec3(0.0, uTime * 0.04, 0.0));
          float vfw = fwidth(vein);
          float vm = (1.0 - smoothstep(0.0, 0.018 + vfw, abs(vein - 0.5))) * (1.0 - smoothstep(0.01, 0.05, vfw));
          float pulse = 0.55 + 0.45 * sin(uTime * 2.4 + vWP.y * 0.25);
          float gm = smoothstep(0.0, 0.3, goo);
          bAlb = mix(bAlb, vec3(0.008, 0.006, 0.01), gm);
          bRough = mix(bRough, 0.1, gm);
          bMetal = mix(bMetal, 0.0, gm);
          bEmis = mix(bEmis, vec3(0.0), gm) + gm * vm * vec3(1.0, 0.04, 0.1) * 1.3 * pulse * smoothstep(0.25, 0.9, goo);
        }
        diffuseColor.rgb = bAlb;
        totalEmissiveRadiance = bEmis;
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = bRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = bMetal;');
  };
  return m;
}

// ---------------------------------------------------------------------------
// Streets, sidewalks, park, puddles, lamp light pools — one big procedural plane.
// ---------------------------------------------------------------------------
function makeGroundMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, CU);
    s.uniforms.uGrid = { value: new THREE.Vector4(L.X0, L.Z0, L.W, L.D) };
    s.uniforms.uPitch = { value: new THREE.Vector4(L.PX, L.PZ, L.AVE, L.ST) };
    s.uniforms.uPark = { value: new THREE.Vector4(PARK_RECT.x0, PARK_RECT.z0, PARK_RECT.x1, PARK_RECT.z1) };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; uniform vec4 uGrid; uniform vec4 uPitch; uniform vec4 uPark;
        uniform float uTime; uniform float uNight; uniform float uLamp; uniform vec4 uHives[8];
        ${GLSL_NOISE}`)
      .replace('#include <color_fragment>', /* glsl */ `
        vec2 p = vWP.xz;
        vec2 lp = p - uGrid.xy;
        float inCity = step(0.0, lp.x) * step(lp.x, uGrid.z) * step(0.0, lp.y) * step(lp.y, uGrid.w);
        float px = mod(lp.x, uPitch.x), pz = mod(lp.y, uPitch.y);
        float AVE = uPitch.z, ST = uPitch.w;
        float ave = step(px, AVE), st = step(pz, ST);
        float park = step(uPark.x, p.x) * step(p.x, uPark.z) * step(uPark.y, p.y) * step(p.y, uPark.w);
        float road = max(ave, st) * inCity * (1.0 - park);
        vec2 fw = fwidth(p);
        float an = vnoise(vec3(p * 1.9, 0.0)) * 0.5 + vnoise(vec3(p * 0.09, 1.0)) * 0.5;
        float wet = smoothstep(0.58, 0.72, vnoise(vec3(p * 0.045, 3.0)));
        vec3 gAlb; float gRough; float gMetal = 0.0; vec3 gEm = vec3(0.0);
        if (road > 0.5) {
          gAlb = vec3(0.05, 0.05, 0.055) * (0.75 + 0.5 * an);
          gRough = mix(0.86, 0.1, wet);
          gAlb *= mix(1.0, 0.55, wet);
          float paint = 0.0;
          float aw = 0.07 + fw.x;
          if (ave > 0.5 && st < 0.5) {
            float dx = px - AVE * 0.5;
            float dash = step(fract(lp.y / 9.0), 0.5);
            paint += (1.0 - smoothstep(aw, aw + fw.x, abs(abs(dx) - 5.0))) * dash;
            paint += (1.0 - smoothstep(aw, aw + fw.x, abs(dx))) * dash;
            paint += 1.0 - smoothstep(aw, aw + fw.x, abs(abs(dx) - (AVE * 0.5 - 0.7)));
            float cw = max(step(pz, ST + 3.6), step(uPitch.y - 3.6, pz));
            paint = max(paint, cw * step(0.5, fract(px / 1.15)) * step(0.6, px) * step(px, AVE - 0.6));
          }
          if (st > 0.5 && ave < 0.5) {
            float dz = pz - ST * 0.5;
            float dash = step(fract(lp.x / 9.0), 0.5);
            paint += (1.0 - smoothstep(aw, aw + fw.y, abs(dz))) * dash;
            paint += 1.0 - smoothstep(aw, aw + fw.y, abs(abs(dz) - (ST * 0.5 - 0.6)));
            float cw = max(step(px, AVE + 3.6), step(uPitch.x - 3.6, px));
            paint = max(paint, cw * step(0.5, fract(pz / 1.15)) * step(0.6, pz) * step(pz, ST - 0.6));
          }
          paint = clamp(paint, 0.0, 1.0) * (0.55 + 0.45 * vnoise(vec3(p * 3.0, 5.0)));
          gAlb = mix(gAlb, vec3(0.55, 0.55, 0.52), paint);
          gRough = mix(gRough, 0.6, paint);
          // manholes
          vec2 mh = fract(p / vec2(37.0, 29.0)) - 0.5;
          float mhole = 1.0 - smoothstep(0.012, 0.016, length(mh * vec2(37.0, 29.0)) / 60.0);
          gAlb = mix(gAlb, vec3(0.08, 0.075, 0.07), mhole);
        } else if (park > 0.5) {
          vec2 pc = (p - (uPark.xy + uPark.zw) * 0.5) / ((uPark.zw - uPark.xy) * 0.5);
          float pond = 1.0 - smoothstep(0.95, 1.0, length((pc - vec2(0.15, -0.35)) * vec2(3.2, 2.6)));
          float pth = 1.0 - smoothstep(0.012, 0.02, abs(vnoise(vec3(p * 0.011, 7.0)) - 0.5));
          float pth2 = 1.0 - smoothstep(0.008, 0.014, abs(vnoise(vec3(p * 0.017, 9.0)) - 0.5));
          vec3 grass = mix(vec3(0.03, 0.07, 0.02), vec3(0.07, 0.11, 0.035), vnoise(vec3(p * 0.3, 2.0)));
          grass *= 0.8 + 0.4 * vnoise(vec3(p * 4.0, 1.0));
          gAlb = mix(grass, vec3(0.2, 0.18, 0.15), max(pth, pth2));
          gRough = 0.95;
          gAlb = mix(gAlb, vec3(0.005, 0.01, 0.015), pond);
          gRough = mix(gRough, 0.02, pond);
        } else if (inCity > 0.5) {
          gAlb = vec3(0.3, 0.295, 0.285) * (0.8 + 0.35 * an);
          vec2 sl = abs(fract(p / 1.6) - 0.5);
          gAlb *= 1.0 - 0.2 * smoothstep(0.46, 0.5, max(sl.x, sl.y)) * (1.0 - smoothstep(0.1, 0.3, max(fw.x, fw.y)));
          float bx = min(px - AVE, uPitch.x - px), bz = min(pz - ST, uPitch.y - pz);
          float curb = 1.0 - smoothstep(0.25, 0.3, min(bx, bz));
          gAlb = mix(gAlb, vec3(0.42, 0.41, 0.39), curb);
          gRough = mix(0.8, 0.3, wet * 0.6);
        } else {
          vec2 sl = abs(fract(p / vec2(2.4, 1.2)) - 0.5);
          gAlb = vec3(0.33, 0.29, 0.25) * (0.8 + 0.3 * an);
          gAlb *= 1.0 - 0.25 * smoothstep(0.45, 0.5, max(sl.x, sl.y)) * (1.0 - smoothstep(0.1, 0.3, max(fw.x, fw.y)));
          gRough = mix(0.75, 0.25, wet * 0.5);
        }
        // pools of light under street lamps
        if (inCity > 0.5 && park < 0.5) {
          float zb = mod(lp.y - ST, uPitch.y);
          float k = clamp(floor((zb - 6.0) / 20.0 + 0.5), 0.0, 2.0);
          float dzl = zb - (6.0 + 20.0 * k);
          float dxl = min(abs(px - (AVE - 1.5)), abs(px - 1.5));
          float xb = mod(lp.x - AVE, uPitch.x);
          float k2 = clamp(floor((xb - 7.0) / 20.0 + 0.5), 0.0, 3.0);
          float dxl2 = xb - (7.0 + 20.0 * k2);
          float dzl2 = min(abs(pz - (ST - 1.5)), abs(pz - 1.5));
          float pool = exp(-(dxl * dxl + dzl * dzl) / 22.0) + exp(-(dxl2 * dxl2 + dzl2 * dzl2) / 22.0);
          gEm += pool * vec3(1.0, 0.66, 0.36) * 0.22 * uLamp * (1.0 + wet * 1.5);
        }
        // goo on the streets
        float goo = 0.0;
        for (int i = 0; i < 8; i++) {
          vec4 hv = uHives[i];
          if (hv.w <= 0.0) continue;
          if (hv.y > 120.0) continue;
          float d0 = length(vWP.xz - hv.xz);
          if (d0 > hv.w * 0.5 + 8.0) continue;
          float dist = d0 + (fbm3(vec3(p * 0.1, float(i))) - 0.5) * 14.0;
          goo = max(goo, (1.0 - smoothstep(hv.w * 0.25, hv.w * 0.5, dist)) * step(hv.y, 160.0) * smoothstep(80.0, 0.0, hv.y - 40.0));
        }
        if (goo > 0.001) {
          float gv = fbm3(vec3(p * 0.55, uTime * 0.05));
          float gfw = fwidth(gv);
          float vm = (1.0 - smoothstep(0.0, 0.02 + gfw, abs(gv - 0.5))) * (1.0 - smoothstep(0.01, 0.05, gfw));
          gAlb = mix(gAlb, vec3(0.006), goo); gRough = mix(gRough, 0.1, goo);
          gEm += goo * vm * vec3(1.0, 0.04, 0.1) * 1.0 * (0.6 + 0.4 * sin(uTime * 2.2 + p.x * 0.1));
        }
        diffuseColor.rgb = gAlb;
        totalEmissiveRadiance = gEm;
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gMetal;');
  };
  return m;
}

function makeWaterMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.06, metalness: 0.0 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = CU.uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP; uniform float uTime;\n${GLSL_NOISE}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 p = vWP.xz; float t = uTime;
          float e = 0.6;
          float h0 = vnoise(vec3(p * 0.15 + vec2(t * 0.3, t * 0.2), t * 0.2)) + 0.5 * vnoise(vec3(p * 0.6 - vec2(t * 0.6, 0.0), t * 0.5));
          float hx = vnoise(vec3((p + vec2(e, 0.0)) * 0.15 + vec2(t * 0.3, t * 0.2), t * 0.2)) + 0.5 * vnoise(vec3((p + vec2(e, 0.0)) * 0.6 - vec2(t * 0.6, 0.0), t * 0.5));
          float hz = vnoise(vec3((p + vec2(0.0, e)) * 0.15 + vec2(t * 0.3, t * 0.2), t * 0.2)) + 0.5 * vnoise(vec3((p + vec2(0.0, e)) * 0.6 - vec2(t * 0.6, 0.0), t * 0.5));
          vec3 wn = normalize(vec3(-(hx - h0) * 0.9, 1.0, -(hz - h0) * 0.9));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`);
  };
  return m;
}

// Merge several primitives into one vertex-coloured geometry.
function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  return g;
}
function box(w, h, d, x, y, z, color) {
  return colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
}
function cyl(rt, rb, h, seg, x, y, z, color) {
  return colored(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), color);
}

// ---------------------------------------------------------------------------
export class City {
  constructor(scene, quality = 1) {
    this.scene = scene;
    this.quality = quality;
    this.boxes = [];
    this.tops = []; // walkable roof rectangles
    this.hives = [];
    this.buildings = [];
    this.lamps = [];
    this.r = rng(1337);
    this.places = {};
    this.signs = [];
    this.bmat = makeBuildingMaterial();
    this.generate();
    this.buildGrid();
  }

  heightField(x, z) {
    const mid = Math.exp(-((x / 260) ** 2 + ((z + 60) / 210) ** 2));
    const down = Math.exp(-(((x + 40) / 230) ** 2 + ((z - 440) / 150) ** 2));
    const edge = clamp(1 - Math.max(Math.abs(x) / (L.W * 0.5), Math.abs(z) / (L.D * 0.5)), 0, 1);
    return 22 + 175 * mid + 160 * down + 25 * edge;
  }

  generate() {
    const r = this.r;
    const tiers = [];
    const addTier = (t) => { tiers.push(t); return t; };
    const pal = {
      glass: [[0.16, 0.18, 0.2], [0.1, 0.12, 0.14], [0.22, 0.24, 0.26], [0.14, 0.16, 0.15]],
      office: [[0.46, 0.44, 0.41], [0.38, 0.37, 0.36], [0.52, 0.49, 0.43], [0.3, 0.31, 0.33]],
      brick: [[0.4, 0.18, 0.12], [0.48, 0.26, 0.16], [0.33, 0.16, 0.11], [0.3, 0.19, 0.15], [0.45, 0.33, 0.24]],
      deco: [[0.62, 0.57, 0.48], [0.54, 0.5, 0.43], [0.48, 0.45, 0.4]],
    };
    const styleIdx = { glass: 0, office: 1, brick: 2, deco: 3 };
    const FLOOR = { glass: 3.9, office: 3.6, brick: 3.2, deco: 3.5 };
    const BAY = { glass: 1.6, office: 3.0, brick: 2.6, deco: 2.2 };
    const billboardBlocks = new Set(['4,9', '5,9', '4,10']);
    const landmarks = { '4,7': 'empire', '3,14': 'tower', '6,9': 'hospital', '5,6': 'bugle', '0,8': 'church', '2,0': 'warehouse' };

    for (let i = 0; i < L.COLS; i++) {
      for (let j = 0; j < L.ROWS; j++) {
        if (isParkBlock(i, j)) continue;
        const b = blockRect(i, j);
        const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        const hb = this.heightField(cx, cz);
        const x0 = b.x0 + L.SW, x1 = b.x1 - L.SW, z0 = b.z0 + L.SW, z1 = b.z1 - L.SW;
        const bill = billboardBlocks.has(`${i},${j}`) ? 1 : 0;
        const lm = landmarks[`${i},${j}`];
        if (lm) {
          this.landmark(lm, x0, z0, x1, z1, addTier, pal, FLOOR, BAY);
          continue;
        }
        const nx = hb > 140 && r() < 0.45 ? 1 : r() < 0.55 ? 2 : 3;
        const nz = nx === 1 ? 1 : r() < 0.6 ? 2 : 1;
        const xs = this.splits(x0, x1, nx), zs = this.splits(z0, z1, nz);
        for (let a = 0; a < nx; a++) {
          for (let c = 0; c < nz; c++) {
            const lx0 = xs[a], lx1 = xs[a + 1], lz0 = zs[c], lz1 = zs[c + 1];
            const minDim = Math.min(lx1 - lx0, lz1 - lz0);
            let h = hb * (0.4 + r() * 0.95) + (r() < 0.05 ? 70 : 0);
            h = clamp(h, 12, Math.min(330, minDim * 9));
            let style;
            const q = r();
            if (h > 120) style = q < 0.6 ? 'glass' : 'deco';
            else if (h > 50) style = q < 0.45 ? 'office' : q < 0.7 ? 'glass' : 'deco';
            else style = q < 0.7 ? 'brick' : 'office';
            if (bill) style = q < 0.5 ? 'office' : 'glass';
            const col = pal[style][Math.floor(r() * pal[style].length)];
            const base = {
              style: styleIdx[style], color: col, seed: r(), lit: 0.14 + r() * 0.3,
              floorH: FLOOR[style] * (0.92 + r() * 0.16), bay: BAY[style] * (0.9 + r() * 0.25), bill,
            };
            const bld = { tiers: [], style, x0: lx0, z0: lz0, x1: lx1, z1: lz1 };
            // setbacks
            let y = 0, ix0 = lx0, iz0 = lz0, ix1 = lx1, iz1 = lz1;
            const setback = (style === 'deco' && h > 45) || (h > 100 && r() < 0.55);
            const glassPodium = style === 'glass' && h > 60 && r() < 0.6;
            const levels = [];
            if (glassPodium) levels.push([Math.min(18, h * 0.2), 0], [h, 4 + r() * 3]);
            else if (setback) {
              const n = h > 160 ? 3 : 2;
              const f1 = 0.45 + r() * 0.2;
              levels.push([h * f1, 0]);
              if (n === 3) levels.push([h * (f1 + (1 - f1) * 0.55), 3 + r() * 3]);
              levels.push([h, 3 + r() * 3]);
            } else levels.push([h, 0]);
            for (const [top, inset] of levels) {
              if (ix1 - ix0 - inset * 2 < 9 || iz1 - iz0 - inset * 2 < 9) break;
              ix0 += inset; iz0 += inset; ix1 -= inset; iz1 -= inset;
              const t = addTier({ ...base, x0: ix0, z0: iz0, x1: ix1, z1: iz1, y0: y, y1: top });
              bld.tiers.push(t);
              y = top;
            }
            if (bld.tiers.length) this.buildings.push(bld);
          }
        }
      }
    }
    this.tiers = tiers;

    // --- instanced buildings ---
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const n = tiers.length;
    const mesh = new THREE.InstancedMesh(geo, this.bmat, n);
    const aColor = new Float32Array(n * 3), aBld = new Float32Array(n * 4), aExt = new Float32Array(n * 4);
    const m4 = new THREE.Matrix4();
    tiers.forEach((t, k) => {
      m4.makeScale(t.x1 - t.x0, t.y1 - t.y0, t.z1 - t.z0).setPosition((t.x0 + t.x1) / 2, t.y0, (t.z0 + t.z1) / 2);
      mesh.setMatrixAt(k, m4);
      aColor.set(t.color, k * 3);
      aBld.set([t.style, t.seed, t.lit, t.y1], k * 4);
      aExt.set([t.y0, t.floorH, t.bay, t.bill], k * 4);
      this.boxes.push({ x0: t.x0, y0: 0, z0: t.z0, x1: t.x1, y1: t.y1, z1: t.z1, kind: 'bld' });
      this.tops.push({ x0: t.x0, z0: t.z0, x1: t.x1, z1: t.z1, y: t.y1 });
    });
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));
    geo.setAttribute('aBld', new THREE.InstancedBufferAttribute(aBld, 4));
    geo.setAttribute('aExt', new THREE.InstancedBufferAttribute(aExt, 4));
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.buildingMesh = mesh;

    this.buildRoofs();
    this.buildGround();
    this.buildLamps();
    this.buildPark();
    this.buildBridge();
    this.buildRykers();
    this.buildSigns();
    this.buildFarShores();
    this.buildCars();
    this.placeHives();
  }

  // Remove the near-side (z0) parapet of the tier whose roof matches `top` — used to open up the spawn view.
  hideParapet(top) {
    const t = this.tiers.find((x) => Math.abs(x.x0 - top.x0) < 0.01 && Math.abs(x.z0 - top.z0) < 0.01 && Math.abs(x.y1 - top.y) < 0.01);
    if (!t || !this.parapetIndex.has(t)) return;
    const k = this.parapetIndex.get(t);
    this.parapetMesh.setMatrixAt(k, new THREE.Matrix4().makeScale(0, 0, 0));
    this.parapetMesh.instanceMatrix.needsUpdate = true;
  }

  splits(a, b, n) {
    const out = [a];
    for (let k = 1; k < n; k++) out.push(lerp(a, b, (k + (this.r() - 0.5) * 0.35) / n));
    out.push(b);
    return out;
  }

  landmark(kind, x0, z0, x1, z1, addTier, pal, FLOOR, BAY) {
    const r = this.r;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const bld = { tiers: [], style: kind, x0, z0, x1, z1 };
    if (kind === 'empire') {
      const base = { style: 3, color: [0.6, 0.56, 0.47], seed: 0.77, lit: 0.55, floorH: 3.6, bay: 2.1, bill: 0 };
      const levels = [[24, 0], [95, 6], [210, 7], [262, 6], [290, 4]];
      let y = 0, ax0 = x0, az0 = z0, ax1 = x1, az1 = z1;
      for (const [top, inset] of levels) {
        ax0 += inset; az0 += inset; ax1 -= inset; az1 -= inset;
        if (ax1 - ax0 < 6 || az1 - az0 < 6) break;
        bld.tiers.push(addTier({ ...base, x0: ax0, z0: az0, x1: ax1, z1: az1, y0: y, y1: top }));
        y = top;
      }
      bld.tiers.push(addTier({ ...base, x0: cx - 2.5, z0: cz - 2.5, x1: cx + 2.5, z1: cz + 2.5, y0: y, y1: y + 28, lit: 0.0 }));
      this.spire = { x: cx, z: cz, y: y + 28, h: 32 };
    } else if (kind === 'hospital') {
      const base = { style: 1, color: [0.78, 0.78, 0.76], seed: 0.12, lit: 0.6, floorH: 3.6, bay: 2.6, bill: 0 };
      bld.tiers.push(addTier({ ...base, x0, z0: z0 + 8, x1, z1, y0: 0, y1: 34 }));
      bld.tiers.push(addTier({ ...base, x0: x0 + 6, z0: z0 + 14, x1: x1 - 6, z1: z1 - 4, y0: 34, y1: 58 }));
      this.places.hospital = { x0, z0, x1, z1, top: 58, bay: new THREE.Vector3(cx, 0, z0 + 3), roof: new THREE.Vector3(cx, 58, (z0 + z1) / 2 + 5) };
    } else if (kind === 'bugle') {
      const base = { style: 3, color: [0.58, 0.55, 0.5], seed: 0.44, lit: 0.55, floorH: 3.5, bay: 2.2, bill: 0 };
      bld.tiers.push(addTier({ ...base, x0, z0, x1, z1, y0: 0, y1: 52 }));
      bld.tiers.push(addTier({ ...base, x0: x0 + 8, z0: z0 + 6, x1: x1 - 8, z1: z1 - 6, y0: 52, y1: 96 }));
      this.places.bugle = { x0: x0 + 8, z0: z0 + 6, x1: x1 - 8, z1: z1 - 6, top: 96, roof: new THREE.Vector3(cx, 96, cz), street: new THREE.Vector3(cx, 0, z1 + 6) };
    } else if (kind === 'church') {
      const base = { style: 3, color: [0.42, 0.38, 0.34], seed: 0.66, lit: 0.0, floorH: 6, bay: 3.2, bill: 0 };
      bld.tiers.push(addTier({ ...base, x0: cx - 12, z0: z0 + 4, x1: cx + 12, z1: z1 - 4, y0: 0, y1: 18 }));
      bld.tiers.push(addTier({ ...base, x0: cx - 5, z0: z1 - 12, x1: cx + 5, z1: z1 - 2, y0: 0, y1: 38 }));
      this.places.church = { cx, cz, front: new THREE.Vector3(cx, 0, z1 + 6), spire: new THREE.Vector3(cx, 38, z1 - 7), nave: { x0: cx - 12, z0: z0 + 4, x1: cx + 12, z1: z1 - 4 } };
    } else if (kind === 'warehouse') {
      const base = { style: 2, color: [0.36, 0.2, 0.15], seed: 0.88, lit: 0.1, floorH: 4.5, bay: 3.4, bill: 0 };
      bld.tiers.push(addTier({ ...base, x0: x0 + 10, z0: z0 + 6, x1: x1 - 10, z1: z1 - 6, y0: 0, y1: 12 }));
      for (const [ax, az] of [[x0, z0], [x1 - 9, z0], [x0, z1 - 9], [x1 - 9, z1 - 9]]) {
        bld.tiers.push(addTier({ ...base, style: 1, color: [0.4, 0.38, 0.36], seed: ax * 0.001, lit: 0.3, x0: ax, z0: az, x1: ax + 9, z1: az + 9, y0: 0, y1: 26 + r() * 10 }));
      }
      this.places.warehouse = { cx, cz, street: new THREE.Vector3(cx, 0, z1 + 8), roof: new THREE.Vector3(cx, 12, cz), corners: [[x0 + 4.5, z0 + 4.5], [x1 - 4.5, z0 + 4.5], [x0 + 4.5, z1 - 4.5], [x1 - 4.5, z1 - 4.5]] };
    } else {
      const base = { style: 0, color: [0.2, 0.23, 0.26], seed: 0.31, lit: 0.6, floorH: 4.0, bay: 1.5, bill: 0 };
      this.places.fisk = { roof: new THREE.Vector3(cx, 318, cz), x0: x0 + 12, z0: z0 + 8, x1: x1 - 12, z1: z1 - 8, street: new THREE.Vector3(cx, 0, z1 + 6) };
      bld.tiers.push(addTier({ ...base, x0, z0, x1, z1, y0: 0, y1: 20 }));
      bld.tiers.push(addTier({ ...base, x0: x0 + 6, z0: z0 + 3, x1: x1 - 6, z1: z1 - 3, y0: 20, y1: 300 }));
      bld.tiers.push(addTier({ ...base, x0: x0 + 12, z0: z0 + 8, x1: x1 - 12, z1: z1 - 8, y0: 300, y1: 318 }));
      this.spire2 = { x: cx, z: cz, y: 318, h: 70 };
    }
    this.buildings.push(bld);
    void r; void pal; void FLOOR; void BAY;
  }

  buildRoofs() {
    const r = rng(99);
    const parapets = [], waterTowers = [], acs = [], bulkheads = [], antennas = [];
    for (const b of this.buildings) {
      b.tiers.forEach((t, k) => {
        const top = k === b.tiers.length - 1;
        const w = t.x1 - t.x0, d = t.z1 - t.z0;
        if (w < 3 || d < 3) return;
        if (t.y1 < 200) parapets.push(t);
        if (!top) return;
        if (t.y1 < 110 && w > 12 && d > 12 && (b.style === 'brick' || b.style === 'office') && r() < 0.55) {
          waterTowers.push({ x: lerp(t.x0 + 4, t.x1 - 4, r()), z: lerp(t.z0 + 4, t.z1 - 4, r()), y: t.y1, s: 0.85 + r() * 0.35, rot: r() * 6 });
        }
        const nac = Math.floor(r() * 5) + 1;
        for (let a = 0; a < nac; a++) acs.push({ x: lerp(t.x0 + 2, t.x1 - 2, r()), z: lerp(t.z0 + 2, t.z1 - 2, r()), y: t.y1, s: 0.7 + r() * 0.8, rot: Math.floor(r() * 4) * Math.PI / 2 });
        if (r() < 0.8) bulkheads.push({ x: lerp(t.x0 + 3, t.x1 - 3, r()), z: lerp(t.z0 + 3, t.z1 - 3, r()), y: t.y1, w: 3 + r() * 3, d: 3 + r() * 3, h: 2.6 + r() * 1.5 });
        if (t.y1 > 90 && r() < 0.5) antennas.push({ x: (t.x0 + t.x1) / 2 + (r() - 0.5) * w * 0.4, z: (t.z0 + t.z1) / 2 + (r() - 0.5) * d * 0.4, y: t.y1, h: 8 + r() * 18 });
      });
    }
    if (this.spire) antennas.push({ x: this.spire.x, z: this.spire.z, y: this.spire.y, h: this.spire.h, big: true });
    if (this.spire2) antennas.push({ x: this.spire2.x, z: this.spire2.z, y: this.spire2.y, h: this.spire2.h, big: true });

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

    // parapets: 4 thin walls per roof
    {
      const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
      const im = new THREE.InstancedMesh(geo, mat, parapets.length * 4);
      this.parapetMesh = im;
      this.parapetIndex = new Map();
      const c = new THREE.Color();
      let k = 0;
      for (const t of parapets) {
        this.parapetIndex.set(t, k);
        const th = 0.35, h = 1.0;
        const w = t.x1 - t.x0, d = t.z1 - t.z0;
        c.setRGB(t.color[0] * 0.8, t.color[1] * 0.8, t.color[2] * 0.8);
        const walls = [
          [t.x0 + w / 2, t.z0 + th / 2, w, th], [t.x0 + w / 2, t.z1 - th / 2, w, th],
          [t.x0 + th / 2, t.z0 + d / 2, th, d], [t.x1 - th / 2, t.z0 + d / 2, th, d],
        ];
        for (const [x, z, sx, sz] of walls) {
          m4.makeScale(sx, h, sz).setPosition(x, t.y1, z);
          im.setMatrixAt(k, m4); im.setColorAt(k, c); k++;
        }
      }
      im.castShadow = true; im.receiveShadow = true;
      this.scene.add(im);
    }
    // water towers
    if (waterTowers.length) {
      const parts = [];
      for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) parts.push(box(0.25, 4, 0.25, x, 2, z, 0x1b1a19));
      parts.push(box(4, 0.25, 0.25, 0, 1.4, -1.6, 0x1b1a19), box(4, 0.25, 0.25, 0, 1.4, 1.6, 0x1b1a19));
      parts.push(cyl(2.3, 2.3, 0.3, 16, 0, 4.1, 0, 0x2a2420));
      parts.push(cyl(2.2, 2.2, 5, 18, 0, 6.6, 0, 0x5a3b26));
      for (let a = 0; a < 3; a++) parts.push(cyl(2.26, 2.26, 0.12, 18, 0, 5 + a * 1.6, 0, 0x222222));
      parts.push(colored(new THREE.ConeGeometry(2.45, 1.7, 18).translate(0, 9.95, 0), 0x2c2a28));
      const geo = mergeGeometries(parts);
      const im = new THREE.InstancedMesh(geo, vmat, waterTowers.length);
      waterTowers.forEach((w, k) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.rot);
        m4.compose(p.set(w.x, w.y, w.z), q, s.set(w.s, w.s, w.s));
        im.setMatrixAt(k, m4);
        this.boxes.push({ x0: w.x - 2.3 * w.s, z0: w.z - 2.3 * w.s, x1: w.x + 2.3 * w.s, z1: w.z + 2.3 * w.s, y0: w.y + 4 * w.s, y1: w.y + 10.8 * w.s, kind: 'prop' });
        this.tops.push({ x0: w.x - 1.5 * w.s, z0: w.z - 1.5 * w.s, x1: w.x + 1.5 * w.s, z1: w.z + 1.5 * w.s, y: w.y + 10.8 * w.s, small: true });
      });
      im.castShadow = true; im.receiveShadow = true;
      this.scene.add(im);
    }
    // AC units
    {
      const geo = mergeGeometries([
        box(2.2, 1.2, 1.4, 0, 0.6, 0, 0x7d8082), box(0.9, 0.08, 0.9, -0.45, 1.24, 0, 0x2a2b2c),
        box(2.3, 0.08, 1.5, 0, 0.04, 0, 0x4a4b4c), cyl(0.06, 0.06, 1.0, 6, 0.9, 1.6, 0.4, 0x666666),
      ]);
      const im = new THREE.InstancedMesh(geo, vmat, acs.length);
      acs.forEach((a, k) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a.rot);
        m4.compose(p.set(a.x, a.y, a.z), q, s.set(a.s, a.s, a.s));
        im.setMatrixAt(k, m4);
      });
      im.castShadow = true; im.receiveShadow = true;
      this.scene.add(im);
    }
    // stair bulkheads
    {
      const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x5a5753, roughness: 0.9 }), bulkheads.length);
      bulkheads.forEach((b, k) => {
        m4.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z);
        im.setMatrixAt(k, m4);
        this.boxes.push({ x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2, y0: b.y, y1: b.y + b.h, kind: 'prop' });
        this.tops.push({ x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2, y: b.y + b.h, small: true });
      });
      im.castShadow = true; im.receiveShadow = true;
      this.scene.add(im);
    }
    // antennas + blinking aviation lights
    {
      const geo = mergeGeometries([cyl(0.08, 0.18, 1, 6, 0, 0.5, 0, 0x8a8a8a), box(0.9, 0.05, 0.05, 0, 0.7, 0, 0x8a8a8a)]);
      const im = new THREE.InstancedMesh(geo, vmat, antennas.length);
      const lightGeo = new THREE.SphereGeometry(0.35, 8, 6);
      this.aviationMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.3, 0.2) });
      const lights = new THREE.InstancedMesh(lightGeo, this.aviationMat, antennas.length);
      antennas.forEach((a, k) => {
        const thick = a.big ? 6 : 1;
        m4.makeScale(thick, a.h, thick).setPosition(a.x, a.y, a.z);
        im.setMatrixAt(k, m4);
        m4.makeScale(a.big ? 2 : 1, a.big ? 2 : 1, a.big ? 2 : 1).setPosition(a.x, a.y + a.h, a.z);
        lights.setMatrixAt(k, m4);
      });
      this.scene.add(im, lights);
    }
  }

  buildGround() {
    const ix = L.ISLAND;
    const w = ix.x1 - ix.x0, d = ix.z1 - ix.z0;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), makeGroundMaterial());
    ground.position.set((ix.x0 + ix.x1) / 2, 0, (ix.z0 + ix.z1) / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);
    // sea wall
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.95 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 4, d + 2), wallMat);
    wall.position.set(ground.position.x, -2.01, ground.position.z);
    wall.receiveShadow = true;
    this.scene.add(wall);
    // railing along the promenade
    const railMat = new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.5, metalness: 0.7 });
    const rails = [];
    const t = 0.08, rh = 1.05;
    rails.push(new THREE.BoxGeometry(w, t, t).translate(0, rh, ix.z0 - ground.position.z + 0.5));
    rails.push(new THREE.BoxGeometry(w, t, t).translate(0, rh, ix.z1 - ground.position.z - 0.5));
    rails.push(new THREE.BoxGeometry(t, t, d).translate(ix.x0 - ground.position.x + 0.5, rh, 0));
    rails.push(new THREE.BoxGeometry(t, t, d).translate(ix.x1 - ground.position.x - 0.5, rh, 0));
    const rail = new THREE.Mesh(mergeGeometries(rails), railMat);
    rail.position.copy(ground.position);
    this.scene.add(rail);
    // water
    const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), makeWaterMaterial());
    water.position.y = L.WATER_Y;
    this.scene.add(water);
    this.water = water;
  }

  buildLamps() {
    const pts = [];
    const inPark = (x, z) => x > PARK_RECT.x0 - 0.1 && x < PARK_RECT.x1 + 0.1 && z > PARK_RECT.z0 - 0.1 && z < PARK_RECT.z1 + 0.1;
    for (let i = 0; i < L.COLS; i++) {
      for (let j = 0; j < L.ROWS; j++) {
        const b = blockRect(i, j);
        const park = isParkBlock(i, j);
        for (let k = 0; k < 3; k++) {
          const z = b.z0 + 6 + 20 * k;
          if (!park || !inPark(b.x0 - 2, z)) pts.push({ x: b.x0 + 1.0, z, dir: -1, axis: 'x' });
          if (!park || !inPark(b.x1 + 2, z)) pts.push({ x: b.x1 - 1.0, z, dir: 1, axis: 'x' });
        }
        for (let k = 0; k < 4; k++) {
          const x = b.x0 + 7 + 20 * k;
          if (!park || !inPark(x, b.z0 - 2)) pts.push({ x, z: b.z0 + 1.0, dir: -1, axis: 'z' });
          if (!park || !inPark(x, b.z1 + 2)) pts.push({ x, z: b.z1 - 1.0, dir: 1, axis: 'z' });
        }
      }
    }
    this.lamps = pts;
    const pole = mergeGeometries([
      cyl(0.07, 0.11, 6.5, 8, 0, 3.25, 0, 0x16191a), cyl(0.18, 0.2, 0.5, 8, 0, 0.25, 0, 0x16191a),
      box(0.08, 0.08, 1.8, 0, 6.4, 0.85, 0x16191a), box(0.36, 0.14, 0.7, 0, 6.33, 1.65, 0x1d2022),
    ]);
    const head = new THREE.BoxGeometry(0.3, 0.06, 0.6).translate(0, 6.24, 1.65);
    const poles = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }), pts.length);
    this.lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 5.2, 2.8) });
    const heads = new THREE.InstancedMesh(head, this.lampMat, pts.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    pts.forEach((p, k) => {
      const ang = p.axis === 'x' ? (p.dir < 0 ? -Math.PI / 2 : Math.PI / 2) : (p.dir < 0 ? Math.PI : 0);
      q.setFromAxisAngle(up, ang);
      m4.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(k, m4); heads.setMatrixAt(k, m4);
    });
    poles.castShadow = true;
    this.scene.add(poles, heads);
  }

  buildPark() {
    const r = rng(7);
    const P = PARK_RECT;
    const trunk = cyl(0.18, 0.28, 3.2, 6, 0, 1.6, 0, 0x2b2016);
    const crowns = [];
    for (let k = 0; k < 4; k++) {
      const g = new THREE.IcosahedronGeometry(1.7 + r() * 0.8, 1);
      const pos = g.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const s = 0.85 + r() * 0.3;
        pos.setXYZ(v, pos.getX(v) * s, pos.getY(v) * s * 0.85, pos.getZ(v) * s);
      }
      g.translate((r() - 0.5) * 1.6, 4.2 + r() * 1.4, (r() - 0.5) * 1.6);
      g.computeVertexNormals();
      crowns.push(colored(g, new THREE.Color().setHSL(0.24 + r() * 0.07, 0.5, 0.12 + r() * 0.06)));
    }
    const geo = mergeGeometries([trunk, ...crowns]);
    const pc = (x, z) => [((x - P.x0) / (P.x1 - P.x0)) * 2 - 1, ((z - P.z0) / (P.z1 - P.z0)) * 2 - 1];
    const trees = [];
    for (let a = 0; a < 900 && trees.length < 420; a++) {
      const x = lerp(P.x0 + 4, P.x1 - 4, r()), z = lerp(P.z0 + 4, P.z1 - 4, r());
      const [u, v] = pc(x, z);
      if (Math.hypot((u - 0.15) * 3.2, (v + 0.35) * 2.6) < 1.15) continue;
      trees.push({ x, z, s: 0.8 + r() * 0.7, rot: r() * 6.28 });
    }
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), trees.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    trees.forEach((t, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
      m4.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      im.setMatrixAt(k, m4);
    });
    im.castShadow = true; im.receiveShadow = true;
    this.scene.add(im);
    this.trees = trees;
  }

  buildBridge() {
    const zc = L.Z0 + 12 * L.PZ + L.ST / 2; // aligned with a street
    const xs = L.ISLAND.x1;
    const a0 = xs, a1 = xs + 24, t1 = xs + 95, t2 = xs + 215, b0 = xs + 286, b1 = xs + 310;
    const deckY = 32, towerH = 98;
    const stone = new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 1 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.5, metalness: 0.6 });
    const addBox = (x0, y0, z0, x1, y1, z1, mat, collide = true, shadow = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.castShadow = shadow; m.receiveShadow = true;
      this.scene.add(m);
      if (collide) {
        this.boxes.push({ x0, y0, z0, x1, y1, z1, kind: 'bridge' });
        this.tops.push({ x0, z0, x1, z1, y: y1 });
      }
      return m;
    };
    addBox(a0, -4, zc - 16, a1, deckY + 2, zc + 16, stone);
    addBox(b0, -4, zc - 16, b1, deckY + 2, zc + 16, stone);
    for (const tx of [t1, t2]) {
      addBox(tx - 7, -4, zc - 17, tx + 7, towerH, zc + 17, stone);
      addBox(tx - 8, towerH - 4, zc - 18, tx + 8, towerH, zc + 18, stone);
      for (const zo of [-7.5, 7.5]) {
        // gothic arch openings (dark insets on both faces)
        addBox(tx - 7.05, deckY + 2, zc + zo - 3.2, tx + 7.05, deckY + 30, zc + zo + 3.2, dark, false, false);
      }
    }
    addBox(a1, deckY, zc - 12, b0, deckY + 2, zc + 12, steel);
    addBox(a1, deckY - 4, zc - 12, b0, deckY, zc - 11, steel, false);
    addBox(a1, deckY - 4, zc + 11, b0, deckY, zc + 12, steel, false);

    // main cables (parabolic spans) + suspenders + necklace lights
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.4, metalness: 0.8 });
    const spanY = (x) => {
      if (x < t1) { const u = (x - a1) / (t1 - a1); return lerp(deckY + 3, towerH, u * u); }
      if (x < t2) { const u = (x - t1) / (t2 - t1) * 2 - 1; return deckY + 6 + (towerH - deckY - 6) * u * u; }
      const u = (b0 - x) / (b0 - t2); return lerp(deckY + 3, towerH, u * u);
    };
    const lightsPos = [];
    const susp = [];
    for (const zo of [-10.5, 10.5]) {
      const pts = [];
      for (let x = a1; x <= b0; x += 4) pts.push(new THREE.Vector3(x, spanY(x), zc + zo));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.45, 6), cableMat);
      this.scene.add(tube);
      for (let x = a1 + 6; x < b0 - 2; x += 6) {
        lightsPos.push([x, spanY(x) + 0.5, zc + zo]);
        if (Math.abs(x - t1) > 8 && Math.abs(x - t2) > 8) susp.push([x, spanY(x), zc + zo]);
      }
    }
    const sgeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 4).translate(0, 0.5, 0);
    const sm = new THREE.InstancedMesh(sgeo, cableMat, susp.length);
    const m4 = new THREE.Matrix4();
    susp.forEach(([x, y, z], k) => { m4.makeScale(1, y - deckY - 2, 1).setPosition(x, deckY + 2, z); sm.setMatrixAt(k, m4); });
    this.scene.add(sm);
    this.bridgeLightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.2, 3) });
    const lm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 6, 4), this.bridgeLightMat, lightsPos.length);
    lightsPos.forEach(([x, y, z], k) => { m4.makeTranslation(x, y, z); lm.setMatrixAt(k, m4); });
    this.scene.add(lm);
    this.bridge = { zc, x0: a0, x1: b1, deckY };
  }

  // A prison island in the East River, reached by a low causeway with pylons to swing from.
  buildRykers() {
    const I = L.ISLAND;
    const cx = I.x1 + 230, cz = L.Z0 + 150, w = 150, d = 120;
    const land = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), new THREE.MeshStandardMaterial({ color: 0x3a3833, roughness: 1 }));
    land.position.set(cx, -2, cz); land.receiveShadow = true;
    this.scene.add(land);
    this.boxes.push({ x0: cx - w / 2, y0: -4, z0: cz - d / 2, x1: cx + w / 2, y1: 0, z1: cz + d / 2, kind: 'bridge' });
    this.tops.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, y: 0 });
    const gray = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.8 });
    const solid = (x0, y0, z0, x1, y1, z1, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      this.boxes.push({ x0, y0, z0, x1, y1, z1, kind: 'bld' });
      this.tops.push({ x0, z0, x1, z1, y: y1 });
    };
    // cell blocks
    for (const [bx, bz, bw, bd, bh] of [[-40, -25, 34, 18, 16], [10, -30, 40, 16, 20], [-35, 18, 28, 22, 14], [18, 15, 36, 20, 24]]) solid(cx + bx - bw / 2, 0, cz + bz - bd / 2, cx + bx + bw / 2, bh, cz + bz + bd / 2, gray);
    // perimeter wall and guard towers
    const wt = 1.2, wh = 7, m = 6;
    solid(cx - w / 2 + m, 0, cz - d / 2 + m, cx + w / 2 - m, wh, cz - d / 2 + m + wt, gray);
    solid(cx - w / 2 + m, 0, cz + d / 2 - m - wt, cx + w / 2 - m, wh, cz + d / 2 - m, gray);
    solid(cx + w / 2 - m - wt, 0, cz - d / 2 + m, cx + w / 2 - m, wh, cz + d / 2 - m, gray);
    solid(cx - w / 2 + m, 0, cz - d / 2 + m, cx - w / 2 + m + wt, wh, cz - 6, gray);
    solid(cx - w / 2 + m, 0, cz + 6, cx - w / 2 + m + wt, wh, cz + d / 2 - m, gray);
    for (const [tx, tz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solid(cx + tx * (w / 2 - m) - 3, 0, cz + tz * (d / 2 - m) - 3, cx + tx * (w / 2 - m) + 3, 15, cz + tz * (d / 2 - m) + 3, dark);
    // causeway from Manhattan's promenade
    const bx0 = I.x1, bx1 = cx - w / 2;
    solid(bx0, 4, cz - 5, bx1, 6, cz + 5, dark);
    for (let x = bx0 + 20; x < bx1 - 10; x += 38) solid(x - 2, -2, cz - 8, x + 2, 34, cz - 6, gray), solid(x - 2, -2, cz + 6, x + 2, 34, cz + 8, gray);
    this.places.rykers = { center: new THREE.Vector3(cx, 0, cz), gate: new THREE.Vector3(cx - w / 2 + 2, 0, cz), bridgeStart: new THREE.Vector3(bx0 - 4, 0, cz), cell: new THREE.Vector3(cx + 10, 20, cz - 30), yard: new THREE.Vector3(cx - 5, 0, cz - 2) };
  }

  sign(text, pos, rotY, w, h, color = '#ff2a2a', bg = 'rgba(0,0,0,0)', font = 'bold 120px Impact, Arial Black, sans-serif') {
    const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w);
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = parseInt(font.match(/(\d+)px/)[1], 10);
    const scale = Math.min(1, (c.width * 0.92) / g.measureText(text).width);
    g.font = font.replace(/\d+px/, `${Math.floor(fs * scale * (c.height / 256))}px`);
    g.fillStyle = color; g.fillText(text, c.width / 2, c.height / 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, color: new THREE.Color(2.2, 2.2, 2.2), depthWrite: false, toneMapped: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.copy(pos); m.rotation.y = rotY;
    this.scene.add(m);
    this.signs.push(m);
    return m;
  }

  buildSigns() {
    const P = this.places;
    if (P.bugle) {
      const b = P.bugle;
      const pos = new THREE.Vector3((b.x0 + b.x1) / 2, b.top + 7, b.z1 - 3);
      this.sign('DAILY BUGLE', pos, 0, 34, 8, '#f4f1e8');
      const frame = new THREE.Mesh(new THREE.BoxGeometry(35, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6 }));
      frame.position.set(pos.x, b.top + 2.6, pos.z); this.scene.add(frame);
      for (const dx of [-14, -5, 5, 14]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), frame.material); leg.position.set(pos.x + dx, b.top + 3.5, pos.z); this.scene.add(leg); }
    }
    if (P.fisk) this.sign('FISK', new THREE.Vector3(P.fisk.roof.x, 312, P.fisk.z1 + 8.2), 0, 22, 6, '#e9d9a8');
    if (P.hospital) {
      const h = P.hospital;
      this.sign('METRO GENERAL HOSPITAL', new THREE.Vector3((h.x0 + h.x1) / 2, 12, h.z0 + 7.8), Math.PI, 30, 3.6, '#ffffff', 'rgba(170,20,30,0.95)', 'bold 90px Arial, sans-serif');
      this.sign('+', new THREE.Vector3((h.x0 + h.x1) / 2, h.top + 3.5, h.z0 + 14.2), Math.PI, 6, 6, '#ff2a2a', 'rgba(255,255,255,0.95)', 'bold 240px Arial, sans-serif');
    }
  }

  // Add solid geometry after the city is built (Helicarrier, camps...).
  addBox(b, walkable = true) {
    b.idx = this.boxes.length;
    this.boxes.push(b);
    const C = this.cell;
    for (let gx = Math.floor(b.x0 / C); gx <= Math.floor(b.x1 / C); gx++)
      for (let gz = Math.floor(b.z0 / C); gz <= Math.floor(b.z1 / C); gz++) {
        const key = gx * 100003 + gz;
        let arr = this.grid.get(key); if (!arr) this.grid.set(key, (arr = [])); arr.push(b);
        if (walkable) { let t = this.topsGrid.get(key); if (!t) this.topsGrid.set(key, (t = [])); t.push(b.top || (b.top = { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y: b.y1 })); }
      }
    if (this.marks.length < this.boxes.length) { const m = new Uint32Array(this.boxes.length + 64); m.set(this.marks); this.marks = m; }
    return b;
  }

  removeBox(b) {
    const C = this.cell;
    for (let gx = Math.floor(b.x0 / C); gx <= Math.floor(b.x1 / C); gx++)
      for (let gz = Math.floor(b.z0 / C); gz <= Math.floor(b.z1 / C); gz++) {
        const key = gx * 100003 + gz;
        const arr = this.grid.get(key); if (arr) { const i = arr.indexOf(b); if (i >= 0) arr.splice(i, 1); }
        const t = this.topsGrid.get(key); if (t && b.top) { const i = t.indexOf(b.top); if (i >= 0) t.splice(i, 1); }
      }
  }

  // Wake the symbiote hives (the story spreads the infestation over time).
  setHives(active, instant = false) {
    for (const h of this.hives) {
      h.active = active;
      if (active) h.group.visible = true;
      if (instant) { h.gooT = active ? 1 : 0; h.group.visible = active && h.alive; CU.uHives.value[h.id].w = h.gooR * h.gooT; h.group.scale.setScalar(Math.max(0.001, h.gooT)); }
    }
  }

  buildFarShores() {
    const r = rng(4242);
    const shoreMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 1 });
    const regions = [
      { x0: L.ISLAND.x1 + 300, x1: L.ISLAND.x1 + 1900, z0: -1600, z1: 1600 },
      { x0: L.ISLAND.x0 - 1900, x1: L.ISLAND.x0 - 380, z0: -1600, z1: 1600 },
      { x0: -1500, x1: 1500, z0: L.ISLAND.z0 - 1700, z1: L.ISLAND.z0 - 420 },
    ];
    const tiers = [];
    for (const g of regions) {
      const land = new THREE.Mesh(new THREE.BoxGeometry(g.x1 - g.x0, 4, g.z1 - g.z0), shoreMat);
      land.position.set((g.x0 + g.x1) / 2, -1.2, (g.z0 + g.z1) / 2);
      this.scene.add(land);
      for (let k = 0; k < 520; k++) {
        const x = lerp(g.x0 + 20, g.x1 - 20, r()), z = lerp(g.z0 + 20, g.z1 - 20, r());
        const near = Math.min(Math.abs(x - L.ISLAND.x1), Math.abs(x - L.ISLAND.x0), Math.abs(z - L.ISLAND.z0));
        if (near > 1100 && r() < 0.6) continue;
        const cluster = Math.exp(-(((z - 250) / 300) ** 2)) * (g === regions[0] ? 1 : 0.6);
        const h = 10 + r() * 30 + (r() < 0.12 + cluster * 0.3 ? 40 + r() * 140 * (0.4 + cluster) : 0);
        const w = 16 + r() * 30, d = 16 + r() * 30;
        const st = h > 60 ? (r() < 0.6 ? 0 : 1) : (r() < 0.6 ? 2 : 1);
        const cols = [[0.16, 0.18, 0.2], [0.4, 0.38, 0.35], [0.38, 0.2, 0.14]];
        tiers.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y1: h, style: st, color: cols[st], seed: r(), lit: 0.3 + r() * 0.4, floorH: 3.5, bay: [1.6, 3, 2.6][st] });
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const n = tiers.length;
    const im = new THREE.InstancedMesh(geo, this.bmat, n);
    const aColor = new Float32Array(n * 3), aBld = new Float32Array(n * 4), aExt = new Float32Array(n * 4);
    const m4 = new THREE.Matrix4();
    tiers.forEach((t, k) => {
      m4.makeScale(t.x1 - t.x0, t.y1, t.z1 - t.z0).setPosition((t.x0 + t.x1) / 2, 0.8, (t.z0 + t.z1) / 2);
      im.setMatrixAt(k, m4);
      aColor.set(t.color, k * 3); aBld.set([t.style, t.seed, t.lit, t.y1], k * 4); aExt.set([1, t.floorH, t.bay, 0], k * 4);
    });
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));
    geo.setAttribute('aBld', new THREE.InstancedBufferAttribute(aBld, 4));
    geo.setAttribute('aExt', new THREE.InstancedBufferAttribute(aExt, 4));
    this.scene.add(im);
  }

  buildCars() {
    const r = rng(555);
    const lanes = [];
    for (let a = 0; a <= L.COLS; a++) {
      if (a === 4 || a === 5) continue; // these avenues are inside the park
      const xc = L.X0 + a * L.PX + L.AVE / 2;
      const dir = a % 2 ? 1 : -1;
      for (const o of [-7.5, -2.5, 2.5, 7.5]) lanes.push({ axis: 'z', c: xc + o, dir, len: L.D, start: L.Z0 });
    }
    for (let s = 0; s <= L.ROWS; s++) {
      if (s >= 2 && s <= 4) continue;
      const zc = L.Z0 + s * L.PZ + L.ST / 2;
      const dir = s % 2 ? 1 : -1;
      for (const o of [-3, 3]) lanes.push({ axis: 'x', c: zc + o, dir, len: L.W, start: L.X0 });
    }
    const cars = [];
    for (const ln of lanes) {
      let t = r() * 30;
      while (t < ln.len) {
        if (r() < (ln.axis === 'z' ? 0.42 : 0.3)) cars.push({ ln, t, v: 7 + r() * 8, taxi: r() < 0.32, len: 4.4 });
        t += 26 + r() * 30;
      }
    }
    this.cars = cars;
    const body = mergeGeometries([
      new THREE.BoxGeometry(1.86, 0.62, 4.5).translate(0, 0.66, 0),
      new THREE.BoxGeometry(1.7, 0.18, 4.3).translate(0, 1.02, 0),
    ]);
    const cabin = mergeGeometries([
      colored(new THREE.BoxGeometry(1.62, 0.55, 2.3).translate(0, 1.38, -0.25), 0x0b0e12),
      ...[[-0.82, 1.45], [0.82, 1.45], [-0.82, -1.4], [0.82, -1.4]].map(([x, z]) =>
        colored(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12).rotateZ(Math.PI / 2).translate(x, 0.36, z), 0x0a0a0a)),
    ]);
    const lights = mergeGeometries([
      colored(new THREE.BoxGeometry(0.42, 0.14, 0.05).translate(-0.62, 0.78, 2.26), 0xfff4e0),
      colored(new THREE.BoxGeometry(0.42, 0.14, 0.05).translate(0.62, 0.78, 2.26), 0xfff4e0),
      colored(new THREE.BoxGeometry(0.4, 0.12, 0.05).translate(-0.66, 0.84, -2.26), 0xff1a10),
      colored(new THREE.BoxGeometry(0.4, 0.12, 0.05).translate(0.66, 0.84, -2.26), 0xff1a10),
    ]);
    const n = cars.length;
    this.carBody = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.6 }), n);
    this.carCabin = new THREE.InstancedMesh(cabin, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.8 }), n);
    this.carLightMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(4, 4, 4) });
    this.carLights = new THREE.InstancedMesh(lights, this.carLightMat, n);
    const c = new THREE.Color();
    const paints = [0x111111, 0xd8d8d8, 0x6b0d0d, 0x1b2a44, 0x3a3d40, 0x0e3b2a, 0x8a8f93];
    cars.forEach((car, k) => {
      c.set(car.taxi ? 0xe3a906 : paints[Math.floor(r() * paints.length)]);
      this.carBody.setColorAt(k, c);
    });
    for (const m of [this.carBody, this.carCabin, this.carLights]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.scene.add(m);
    }
    this.carBody.castShadow = true;
    this.updateCars(0);
  }

  // Cars brake for anything in `blockers` ([{x, z, r}]) — the player, fights in progress.
  updateCars(dt, blockers = []) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const cars = this.cars;
    for (let k = 0; k < cars.length; k++) {
      const car = cars[k];
      if (car.cur === undefined) car.cur = car.v;
      let want = car.v;
      if (blockers.length) {
        const ahead = car.ln.start + (car.ln.dir > 0 ? car.t : car.ln.len - car.t) + car.ln.dir * 7;
        const cx = car.ln.axis === 'z' ? car.ln.c : ahead, cz = car.ln.axis === 'z' ? ahead : car.ln.c;
        for (const b of blockers) if (Math.abs(cx - b.x) < b.r && Math.abs(cz - b.z) < b.r) { want = 0; break; }
      }
      car.cur += Math.max(-14 * dt, Math.min(6 * dt, want - car.cur));
      car.t = (car.t + car.cur * dt) % car.ln.len;
      const along = car.ln.start + (car.ln.dir > 0 ? car.t : car.ln.len - car.t);
      if (car.ln.axis === 'z') { p.set(car.ln.c, 0, along); q.setFromAxisAngle(up, car.ln.dir > 0 ? 0 : Math.PI); }
      else { p.set(along, 0, car.ln.c); q.setFromAxisAngle(up, car.ln.dir > 0 ? Math.PI / 2 : -Math.PI / 2); }
      m4.compose(p, q, s);
      this.carBody.setMatrixAt(k, m4); this.carCabin.setMatrixAt(k, m4); this.carLights.setMatrixAt(k, m4);
    }
    this.carBody.instanceMatrix.needsUpdate = true;
    this.carCabin.instanceMatrix.needsUpdate = true;
    this.carLights.instanceMatrix.needsUpdate = true;
  }

  placeHives() {
    const r = rng(2024);
    const cands = this.buildings.filter((b) => {
      const t = b.tiers[b.tiers.length - 1];
      return t.y1 > 35 && t.y1 < 150 && t.x1 - t.x0 > 16 && t.z1 - t.z0 > 16;
    });
    const chosen = [];
    for (let a = 0; a < 400 && chosen.length < 6; a++) {
      const b = cands[Math.floor(r() * cands.length)];
      const t = b.tiers[b.tiers.length - 1];
      const x = (t.x0 + t.x1) / 2, z = (t.z0 + t.z1) / 2;
      if (chosen.some((c) => Math.hypot(c.x - x, c.z - z) < 260)) continue;
      chosen.push({ x, z, y: t.y1, t });
    }
    const hiveMat = new THREE.MeshPhysicalMaterial({ color: 0x050407, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 1, sheenColor: new THREE.Color(0.3, 0.05, 0.25) });
    hiveMat.onBeforeCompile = (s) => {
      s.uniforms.uTime = CU.uTime;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime; varying vec3 vOP;\n${GLSL_NOISE}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vOP = position;
          float dsp = fbm3(position * 1.6 + vec3(0.0, uTime * 0.25, 0.0));
          transformed += normal * (dsp - 0.5) * 0.55 + normal * sin(uTime * 2.0 + position.y * 3.0) * 0.03;`);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uTime; varying vec3 vOP;\n${GLSL_NOISE}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float vn = fbm3(vOP * 2.4 + vec3(0.0, uTime * 0.1, 0.0));
          float vein = 1.0 - smoothstep(0.0, 0.022 + fwidth(vn), abs(vn - 0.5));
          totalEmissiveRadiance += vein * vec3(1.0, 0.05, 0.12) * (1.4 + 1.0 * sin(uTime * 3.0 + vOP.y * 2.0));`);
    };
    this.hiveMat = hiveMat;
    const blob = new THREE.IcosahedronGeometry(1, 5);
    chosen.forEach((c, k) => {
      const g = new THREE.Group();
      g.position.set(c.x, c.y, c.z);
      const core = new THREE.Mesh(blob, hiveMat);
      core.scale.set(5.5, 4.2, 5.5);
      core.position.y = 2.2;
      core.castShadow = true;
      g.add(core);
      // tendrils reaching off the roof
      for (let a = 0; a < 7; a++) {
        const ang = (a / 7) * Math.PI * 2 + r();
        const len = 7 + r() * 9;
        const pts = [];
        for (let u = 0; u <= 6; u++) {
          const t = u / 6;
          pts.push(new THREE.Vector3(Math.cos(ang) * (2 + t * len), 2 + Math.sin(t * Math.PI) * (3 + r() * 5) - t * t * 4, Math.sin(ang) * (2 + t * len)));
        }
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.7 - 0.0, 7), hiveMat);
        tube.castShadow = true;
        g.add(tube);
      }
      this.scene.add(g);
      const hive = {
        id: k, pos: new THREE.Vector3(c.x, c.y + 2.5, c.z), hp: 450, maxHp: 450, alive: true, active: true,
        get solid() { return this.alive && this.active; },
        group: g, core, gooR: 30 + r() * 8, gooT: 1, roof: c.t,
        box: { x0: c.x - 4.5, z0: c.z - 4.5, x1: c.x + 4.5, z1: c.z + 4.5, y0: c.y, y1: c.y + 6.5, kind: 'hive' },
      };
      hive.box.hive = hive;
      this.boxes.push(hive.box);
      this.hives.push(hive);
      CU.uHives.value[k].set(c.x, c.y + 2, c.z, hive.gooR);
    });
  }

  // --- spatial queries ----------------------------------------------------
  buildGrid() {
    const C = (this.cell = 32);
    this.grid = new Map();
    this.boxes.forEach((b, idx) => {
      b.idx = idx;
      for (let gx = Math.floor(b.x0 / C); gx <= Math.floor(b.x1 / C); gx++)
        for (let gz = Math.floor(b.z0 / C); gz <= Math.floor(b.z1 / C); gz++) {
          const key = gx * 100003 + gz;
          let arr = this.grid.get(key);
          if (!arr) this.grid.set(key, (arr = []));
          arr.push(b);
        }
    });
    this.stamp = 0;
    this.marks = new Uint32Array(this.boxes.length);
    this.topsGrid = new Map();
    this.tops.forEach((t) => {
      for (let gx = Math.floor(t.x0 / C); gx <= Math.floor(t.x1 / C); gx++)
        for (let gz = Math.floor(t.z0 / C); gz <= Math.floor(t.z1 / C); gz++) {
          const key = gx * 100003 + gz;
          let arr = this.topsGrid.get(key);
          if (!arr) this.topsGrid.set(key, (arr = []));
          arr.push(t);
        }
    });
  }

  cellBoxes(gx, gz) { return this.grid.get(gx * 100003 + gz); }

  boxesNear(x, z, r, out = []) {
    out.length = 0;
    const C = this.cell, st = ++this.stamp;
    for (let gx = Math.floor((x - r) / C); gx <= Math.floor((x + r) / C); gx++)
      for (let gz = Math.floor((z - r) / C); gz <= Math.floor((z + r) / C); gz++) {
        const arr = this.cellBoxes(gx, gz);
        if (!arr) continue;
        for (const b of arr) { if (this.marks[b.idx] !== st) { this.marks[b.idx] = st; out.push(b); } }
      }
    return out;
  }

  // Height of the surface you'd stand on at (x,z), considering only surfaces at or below y+step.
  groundAt(x, z, y = 1e9, step = 0.6) {
    let best = this.onIsland(x, z) ? 0 : L.WATER_Y;
    const arr = this.topsGrid.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    if (arr) for (const t of arr) {
      if (x >= t.x0 && x <= t.x1 && z >= t.z0 && z <= t.z1 && t.y <= y + step && t.y > best) best = t.y;
    }
    for (const h of this.hives) {
      if (!h.solid) continue;
      const b = h.box;
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 <= y + step && b.y1 > best) best = b.y1;
    }
    return best;
  }

  onIsland(x, z) {
    const I = L.ISLAND;
    if (x >= I.x0 && x <= I.x1 && z >= I.z0 && z <= I.z1) return true;
    return false;
  }

  // Top of whatever's under (x,z) regardless of height (for spawning).
  roofAt(x, z) { return this.groundAt(x, z, 1e9, 0); }

  // Ray vs. all boxes via 2D DDA over the grid. Returns {t, point, normal, box} or null.
  raycast(o, d, maxT, out = {}) {
    const C = this.cell;
    let best = maxT, bestBox = null, bn = 0;
    const st = ++this.stamp;
    let gx = Math.floor(o.x / C), gz = Math.floor(o.z / C);
    const sx = d.x > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    const tdx = Math.abs(d.x) > 1e-9 ? C / Math.abs(d.x) : Infinity;
    const tdz = Math.abs(d.z) > 1e-9 ? C / Math.abs(d.z) : Infinity;
    let tmx = Math.abs(d.x) > 1e-9 ? ((sx > 0 ? (gx + 1) * C : gx * C) - o.x) / d.x : Infinity;
    let tmz = Math.abs(d.z) > 1e-9 ? ((sz > 0 ? (gz + 1) * C : gz * C) - o.z) / d.z : Infinity;
    let tCell = 0;
    for (let guard = 0; guard < 256; guard++) {
      const arr = this.cellBoxes(gx, gz);
      if (arr) for (const b of arr) {
        if (this.marks[b.idx] === st) continue;
        this.marks[b.idx] = st;
        if (b.kind === 'hive' && !b.hive.solid) continue;
        const hit = rayBox(o, d, b);
        if (hit && hit.t < best) { best = hit.t; bestBox = b; bn = hit.n; }
      }
      const tNext = Math.min(tmx, tmz);
      if (best <= tNext || tNext > maxT) break;
      tCell = tNext;
      if (tmx < tmz) { tmx += tdx; gx += sx; } else { tmz += tdz; gz += sz; }
    }
    void tCell;
    // ground / water plane
    if (d.y < -1e-6) {
      const py = this.onIsland(o.x + d.x * ((0 - o.y) / d.y), o.z + d.z * ((0 - o.y) / d.y)) ? 0 : L.WATER_Y;
      const tg = (py - o.y) / d.y;
      if (tg > 0 && tg < best) { best = tg; bestBox = null; bn = 4; }
    }
    if (best >= maxT) return null;
    out.t = best;
    out.point = (out.point || new THREE.Vector3()).copy(o).addScaledVector(d, best);
    out.normal = (out.normal || new THREE.Vector3()).set(...NORMALS[bn]);
    out.box = bestBox;
    out.ground = bestBox === null;
    return out;
  }

  // Push a sphere out of boxes. Returns the dominant contact normal (or null).
  collide(p, rad, outN) {
    const C = this.cell;
    let hit = false;
    outN.set(0, 0, 0);
    const st = ++this.stamp;
    for (let gx = Math.floor((p.x - rad) / C); gx <= Math.floor((p.x + rad) / C); gx++)
      for (let gz = Math.floor((p.z - rad) / C); gz <= Math.floor((p.z + rad) / C); gz++) {
        const arr = this.cellBoxes(gx, gz);
        if (!arr) continue;
        for (const b of arr) {
          if (this.marks[b.idx] === st) continue;
          this.marks[b.idx] = st;
          if (b.kind === 'hive' && !b.hive.solid) continue;
          const cx = clamp(p.x, b.x0, b.x1), cy = clamp(p.y, b.y0, b.y1), cz = clamp(p.z, b.z0, b.z1);
          let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= rad * rad) continue;
          if (d2 < 1e-10) {
            // centre inside: exit through the nearest face
            const pen = [p.x - b.x0, b.x1 - p.x, p.y - b.y0, b.y1 - p.y, p.z - b.z0, b.z1 - p.z];
            let mi = 0;
            for (let k = 1; k < 6; k++) if (pen[k] < pen[mi]) mi = k;
            const nn = NORMALS[[1, 0, 3, 2, 5, 4][mi] === undefined ? 0 : mi];
            void nn;
            const dirs = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
            const dv = dirs[mi];
            p.x += dv[0] * (pen[mi] + rad); p.y += dv[1] * (pen[mi] + rad); p.z += dv[2] * (pen[mi] + rad);
            outN.x += dv[0]; outN.y += dv[1]; outN.z += dv[2];
            hit = true;
            continue;
          }
          const d = Math.sqrt(d2);
          const push = rad - d;
          dx /= d; dy /= d; dz /= d;
          p.x += dx * push; p.y += dy * push; p.z += dz * push;
          outN.x += dx; outN.y += dy; outN.z += dz;
          hit = true;
        }
      }
    if (hit) outN.normalize();
    return hit;
  }

  // Is point p (with clearance r) inside any solid box? Returns the box or null.
  pointInBox(p, r = 0.3) {
    const arr = this.cellBoxes(Math.floor(p.x / this.cell), Math.floor(p.z / this.cell));
    if (!arr) return null;
    for (const b of arr) {
      if (b.kind === 'hive' && !b.hive.solid) continue;
      if (p.x > b.x0 + r && p.x < b.x1 - r && p.z > b.z0 + r && p.z < b.z1 - r && p.y > b.y0 + r && p.y < b.y1 - r) return b;
    }
    return null;
  }

  // Box whose vertical face the point is touching (for wall crawling).
  wallAt(p, n, dist = 0.9) {
    const q = new THREE.Vector3(p.x - n.x * dist, p.y, p.z - n.z * dist);
    const arr = this.cellBoxes(Math.floor(q.x / this.cell), Math.floor(q.z / this.cell));
    if (!arr) return null;
    for (const b of arr) {
      if (b.kind === 'hive' && !b.hive.solid) continue;
      if (q.x >= b.x0 - 0.05 && q.x <= b.x1 + 0.05 && q.z >= b.z0 - 0.05 && q.z <= b.z1 + 0.05 && p.y >= b.y0 - 0.5 && p.y <= b.y1 + 0.2) return b;
    }
    return null;
  }

  update(dt, blockers) {
    this.updateCars(dt, blockers);
    const t = CU.uTime.value;
    if (this.aviationMat) this.aviationMat.color.setRGB(Math.sin(t * 2.2) > 0.2 ? 7 : 0.4, 0.25, 0.15);
    for (const h of this.hives) {
      const u = CU.uHives.value[h.id];
      if (h.alive && !h.active) {
        h.gooT = Math.max(0, h.gooT - dt * 0.5);
        u.w = h.gooR * h.gooT; h.group.scale.setScalar(Math.max(0.001, h.gooT));
        if (h.gooT <= 0) h.group.visible = false;
      } else if (h.alive && h.active && h.gooT < 1) {
        h.group.visible = true;
        h.gooT = Math.min(1, h.gooT + dt * 0.15);
        u.w = h.gooR * h.gooT; h.group.scale.setScalar(Math.max(0.001, h.gooT));
      } else if (!h.alive) {
        h.gooT = Math.max(0, h.gooT - dt * 0.25);
        u.w = h.gooR * h.gooT;
        h.group.scale.setScalar(Math.max(0.001, h.gooT));
        if (h.gooT <= 0) h.group.visible = false;
      } else {
        const pulse = 1 + Math.sin(t * 2.0 + h.id) * 0.03;
        h.core.scale.set(5.5 * pulse, 4.2 / pulse, 5.5 * pulse);
      }
    }
  }
}

const NORMALS = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
// index: 0 -x,1 +x,2 -y,3 +y,4 ground(+y),5 -z,6 +z
function rayBox(o, d, b) {
  let tmin = -Infinity, tmax = Infinity, n = -1;
  const axes = [[o.x, d.x, b.x0, b.x1, 0], [o.y, d.y, b.y0, b.y1, 2], [o.z, d.z, b.z0, b.z1, 5]];
  for (const [oo, dd, lo, hi, base] of axes) {
    if (Math.abs(dd) < 1e-12) { if (oo < lo || oo > hi) return null; continue; }
    let t1 = (lo - oo) / dd, t2 = (hi - oo) / dd;
    let n1 = base, n2 = base === 5 ? 6 : base + 1; // entering through lo face has normal -axis
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; const nn = n1; n1 = n2; n2 = nn; }
    if (t1 > tmin) { tmin = t1; n = n1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin < 0) return null;
  return { t: tmin, n };
}
