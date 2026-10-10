import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HERO_U } from './character.js';

// Custom character models: GLBs rigged to Shadow Web's skeleton by tools/bake/rig_textured.py.
// The personal build (build.mjs, from the git-ignored private/ folder) embeds them as window.__SW_MODELS;
// each one names the slot it replaces ('spidey' for the hero, or a cast id such as 'jjj').
export const CUSTOM = {};

export async function loadCustomModels() {
  const list = (typeof window !== 'undefined' && window.__SW_MODELS) || [];
  const loader = new GLTFLoader();
  for (const m of list) {
    try {
      const raw = atob(m.data);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const gltf = await loader.parseAsync(bytes.buffer, '');
      const extras = (gltf.asset && gltf.asset.extras) || (gltf.parser && gltf.parser.json.asset.extras) || {};
      const slot = (extras.shadowweb && extras.shadowweb.slot) || m.slot;
      if (slot) CUSTOM[slot] = gltf;
    } catch (err) {
      console.warn('custom model failed to load', m.name, err);
    }
  }
  delete window.__SW_MODELS; // the parsed copies are all we need
}

export function customFor(slot) { return slot ? CUSTOM[slot] || null : null; }

// A fresh instance: its own skeleton and materials (textures stay shared).
export function instanceCustom(gltf, hero) {
  const scene = cloneSkinned(gltf.scene);
  const bones = {}, mats = [];
  scene.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      o.material = Array.isArray(o.material) ? o.material.map((x) => x.clone()) : o.material.clone();
      for (const mm of [].concat(o.material)) {
        mats.push(mm);
        if (hero) {
          // the symbiote suit darkens the model as the suit sweeps over
          mm.onBeforeCompile = (s) => {
            s.uniforms.uMix = HERO_U.uMix;
            s.fragmentShader = s.fragmentShader
              .replace('#include <common>', '#include <common>\nuniform float uMix;')
              .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), vec3(0.11, 0.11, 0.14), uMix);');
          };
        }
      }
    }
  });
  return { scene, bones, mats };
}
