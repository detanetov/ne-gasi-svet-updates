// НЕ ГАСИ СВЕТ — основной код игры
import * as THREE from 'three';
import { EffectComposer } from '../lib/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/postprocessing/RenderPass.js';
import { ShaderPass } from '../lib/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../lib/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../lib/postprocessing/OutputPass.js';
import { generateMaze, buildWorld, TILE, WALL_H, tileCenter, toTile, bfs, lineOfSight, flashlightCookie } from './world.js';
import { Sound } from './audio.js';
import { makeMonster, poseMonster } from './monster.js';
import { CHAPTERS, PERKS, TOTAL_NOTES, finalEnding } from './chapters.js';
import { GTAOPass } from '../lib/postprocessing/GTAOPass.js';
import { RealtimeNet, LanNet, LocalNet } from './net.js';

const $ = (id) => document.getElementById(id);
const COLORS = ['#e04f3a', '#3aa0e0', '#5fd16b', '#e0c03a', '#b45fe0', '#e8e8e8'];
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);

// ---------------- Настройки ----------------
const S = { sens: 1, vol: 0.8, bri: 1, qual: 'high', fov: 75, nick: '', color: 0 };
try { Object.assign(S, JSON.parse(localStorage.getItem('ngs-settings') || '{}')); } catch (e) {}
const saveS = () => { try { localStorage.setItem('ngs-settings', JSON.stringify(S)); } catch (e) {} };
if (params.get('q')) S.qual = params.get('q');
if (!S.nick) S.nick = 'Игрок' + Math.floor(Math.random() * 900 + 100);

// ---------------- Прогресс ----------------
const SAVE = { unlocked: 1, ch: 0, perks: [], notes: {}, hints: {}, done: false };
try { Object.assign(SAVE, JSON.parse(localStorage.getItem('ngs-save') || '{}')); } catch (e) {}
const saveP = () => { try { localStorage.setItem('ngs-save', JSON.stringify(SAVE)); } catch (e) {} };
const hasPerk = (k) => SAVE.perks.includes(k);
const notesTotal = () => Object.values(SAVE.notes).reduce((a, b) => a + b, 0);
function hint(key, text) { if (SAVE.hints[key]) return; SAVE.hints[key] = 1; saveP(); log(text, 8000); }

const me = { id: Math.random().toString(36).slice(2, 10), get name() { return S.nick; }, get color() { return S.color; } };
const sound = new Sound(); sound.setVolume(S.vol);

// ---------------- Рендер ----------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = S.bri;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const QUAL = {
  low: { pr: 0.75, shadow: 512, others: false, samples: 0, bloom: false, tex: 'low', ao: false },
  mid: { pr: 1, shadow: 1024, others: false, samples: 2, bloom: true, tex: 'mid', ao: false },
  high: { pr: 1, shadow: 1024, others: true, samples: 4, bloom: true, tex: 'high', ao: true },
  ultra: { pr: 2, shadow: 2048, others: true, samples: 4, bloom: true, tex: 'ultra', ao: true }
};
let Q = QUAL[S.qual] || QUAL.high;

const camera = new THREE.PerspectiveCamera(S.fov, innerWidth / innerHeight, 0.05, 120);
let scene = new THREE.Scene();
let composer, bloomPass, horrorPass, renderPass, aoPass;

const HorrorShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, fear: { value: 0 }, damage: { value: 0 }, glitch: { value: 0 }, grain: { value: 0.07 }, res: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, fear, damage, glitch, grain; uniform vec2 res; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5; float d = length(c * vec2(res.x/res.y, 1.0)) ;
      uv += vec2(sin(uv.y*28.0 + time*6.0), cos(uv.x*22.0 + time*5.0)) * 0.0022 * fear;
      if (glitch > 0.0) { float band = floor(uv.y * 24.0 + floor(time * 40.0)); float r = rand(vec2(band, floor(time * 30.0))); if (r < glitch * 0.45) uv.x += (rand(vec2(band, time)) - 0.5) * 0.16 * glitch; }
      float ca = (0.002 + 0.008*fear + 0.02*damage + 0.05*glitch) * length(c);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c*ca*4.0).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c*ca*4.0).b;
      float n = rand(floor(uv*res) + fract(time*7.31)*100.0) - 0.5;
      col += n * grain * (0.7 + fear*0.9);
      float vig = smoothstep(1.05, 0.25 - fear*0.15, d);
      col *= mix(0.15, 1.0, vig);
      col = mix(col, vec3(dot(col, vec3(0.5,0.3,0.2)))*vec3(1.6,0.25,0.2), damage*0.75);
      col = mix(col, vec3(1.0) - col, step(0.93, rand(vec2(floor(time * 24.0), 3.0))) * step(0.5, glitch));
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += vec3(-0.004, 0.006, 0.012) * (1.0 - smoothstep(0.0, 0.2, lum));
      col *= mix(vec3(1.0), vec3(1.04, 1.0, 0.94), smoothstep(0.3, 0.9, lum));
      gl_FragColor = vec4(col, 1.0);
    }`
};

function setupComposer() {
  Q = QUAL[S.qual] || QUAL.high;
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
  renderer.setSize(innerWidth, innerHeight, false);
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: Q.samples });
  composer = new EffectComposer(renderer, rt);
  renderPass = new RenderPass(scene, camera); composer.addPass(renderPass);
  aoPass = null;
  if (Q.ao) {
    aoPass = new GTAOPass(scene, camera, innerWidth, innerHeight);
    aoPass.output = GTAOPass.OUTPUT.Default; aoPass.blendIntensity = 0.9;
    aoPass.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 1.2, scale: 1.2, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
    // прозрачное (лучи, пыль, спрайты) не должно попадать в карту затенения
    const orig = aoPass.render.bind(aoPass);
    aoPass.render = (...a) => { const hid = []; scene.traverse((o) => { if (o.visible && (o.isPoints || o.isSprite || (o.material && (o.material.transparent || o.material.blending === THREE.AdditiveBlending)))) { o.visible = false; hid.push(o); } }); orig(...a); hid.forEach((o) => { o.visible = true; }); };
    composer.addPass(aoPass);
  }
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.5, 0.82);
  bloomPass.enabled = Q.bloom; composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  horrorPass = new ShaderPass(HorrorShader); composer.addPass(horrorPass);
  onResize();
}
function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  if (composer) composer.setSize(innerWidth, innerHeight);
  if (horrorPass) horrorPass.uniforms.res.value.set(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
}
addEventListener('resize', onResize);

// ---------------- Модели ----------------
function nameSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.font = '28px PTMono, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(text, 129, 34); g.fillStyle = color; g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0 }));
  s.scale.set(1.0, 0.25, 1); return s;
}

const beamMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { color: { value: new THREE.Color(1, 0.93, 0.8) }, op: { value: 1 } },
  vertexShader: `varying float vL; varying vec3 vN; varying vec3 vV;
    void main(){ vL = -position.z / 9.0; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 color; uniform float op; varying float vL; varying vec3 vN; varying vec3 vV;
    void main(){ float e = pow(abs(dot(vN, vV)), 1.5); float a = pow(1.0 - clamp(vL,0.0,1.0), 2.2) * 0.07 * e * op; gl_FragColor = vec4(color * a, a); }`
});

// Шахтёр: тёмная роба, каска цвета игрока, фонарь в руке
function makeAvatar(name, colorIdx) {
  const col = new THREE.Color(COLORS[colorIdx % COLORS.length]);
  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
  const cloth = new THREE.MeshStandardMaterial({ color: 0x262a2f, roughness: 0.9 });
  const vest = new THREE.MeshStandardMaterial({ color: 0x3b3a30, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x9c7660, roughness: 0.7 });
  const helmetM = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.7), roughness: 0.45 });
  const boots = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 6, 12), cloth); torso.position.y = 1.18; torso.scale.set(1.1, 1, 0.75); body.add(torso);
  const v = new THREE.Mesh(new THREE.CapsuleGeometry(0.235, 0.3, 6, 12), vest); v.position.y = 1.3; v.scale.set(1.1, 1, 0.78); body.add(v);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), skin); head.position.y = 1.66; head.scale.set(0.9, 1.05, 0.95); body.add(head);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), helmetM); helm.position.y = 1.7; body.add(helm);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.015, 24), helmetM); brim.position.y = 1.7; body.add(brim);
  const legs = [];
  for (const s of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(s * 0.11, 0.85, 0);
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.62, 4, 8), cloth); l.position.y = -0.4; lg.add(l);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.24), boots); b.position.set(0, -0.8, -0.04); lg.add(b);
    body.add(lg); legs.push(lg);
  }
  const arm = new THREE.Group(); arm.position.set(0.27, 1.4, 0); body.add(arm);
  const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.42, 4, 8), cloth); a.rotation.x = Math.PI / 2; a.position.z = -0.23; arm.add(a);
  const other = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.5, 4, 8), cloth); other.position.set(-0.27, 1.12, 0); body.add(other);
  const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.85, roughness: 0.35 }));
  torch.rotation.x = Math.PI / 2; torch.position.z = -0.52; arm.add(torch);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: 0xfff2d8 })); lens.position.z = -0.635; lens.rotation.y = Math.PI; arm.add(lens);
  const cone = new THREE.ConeGeometry(2.3, 9, 32, 1, true); cone.translate(0, -4.5, 0); cone.rotateX(-Math.PI / 2);
  const beam = new THREE.Mesh(cone, beamMat()); beam.position.z = -0.64; arm.add(beam);
  const glowC = document.createElement('canvas'); glowC.width = glowC.height = 64; const gg = glowC.getContext('2d');
  const grd = gg.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,245,225,1)'); grd.addColorStop(0.2, 'rgba(255,230,190,.45)'); grd.addColorStop(1, 'rgba(255,200,150,0)');
  gg.fillStyle = grd; gg.fillRect(0, 0, 64, 64);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowC), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(0.5); glow.position.z = -0.68; arm.add(glow);
  g.traverse((o) => { if (o.isMesh && o !== beam) { o.castShadow = true; o.receiveShadow = true; } });
  const tag = nameSprite(name, COLORS[colorIdx % COLORS.length]); tag.position.y = 2.05; g.add(tag);
  return { group: g, body, arm, legs, beam, glow, lens, tag };
}

// Предохранитель: керамика с латунью и янтарным окошком; батарейка
function makeItem(kind) {
  const g = new THREE.Group();
  if (kind === 'fuse') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 14), new THREE.MeshStandardMaterial({ color: 0xd9d2c0, roughness: 0.35 }));
    const capM = new THREE.MeshStandardMaterial({ color: 0xa8854a, metalness: 0.95, roughness: 0.25 });
    for (const y of [-0.09, 0.09]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.035, 14), capM); cap.position.y = y; g.add(cap); }
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.012), new THREE.MeshStandardMaterial({ color: 0x3a1800, emissive: 0xff8a2a, emissiveIntensity: 1.4 }));
    win.position.z = -0.032; g.add(body, win);
    g.rotation.set(Math.PI / 2, 0, Math.random() * 6); g.position.y = 0.04;
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.17, 14), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.3 }));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.07, 14), new THREE.MeshStandardMaterial({ color: 0x8a6a1a, roughness: 0.4, metalness: 0.4 }));
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.2 })); tip.position.y = 0.095;
    g.add(body, band, tip); g.rotation.z = Math.PI / 2; g.position.y = 0.045;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Клеть подъёмника: решётка, щиток с пятью лампами
function makeDoor(pos, dir) {
  const g = new THREE.Group();
  g.position.copy(pos); g.lookAt(pos.x - dir[0], 0, pos.z - dir[1]);
  const iron = new THREE.MeshStandardMaterial({ color: 0x2e2622, roughness: 0.55, metalness: 0.8 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x4a2a1c, roughness: 0.85, metalness: 0.4 });
  const exitPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.4), new THREE.MeshBasicMaterial({ color: 0x0a0b0d })); exitPlane.position.set(0, 1.2, 0.02); g.add(exitPlane);
  const panel = new THREE.Group(); panel.position.set(0, 1.2, 0.1); g.add(panel);
  for (let i = 0; i < 9; i++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.4, 6), rust); bar.position.x = -0.68 + i * 0.17; panel.add(bar); }
  for (let i = 0; i < 4; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.06, 0.05), iron); bar.position.y = -1.1 + i * 0.73; panel.add(bar); }
  for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.8, 0.25), iron); post.position.set(s * 0.85, 1.4, 0.1); g.add(post); }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.25, 0.25), iron); lintel.position.set(0, 2.75, 0.1); g.add(lintel);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.12), iron); box.position.set(1.25, 1.45, 0.12); g.add(box);
  const lamps = [];
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshStandardMaterial({ color: 0x220a04, emissive: 0xff2a10, emissiveIntensity: 0.6 })); m.position.set(1.07 + i * 0.09, 1.5, 0.19); g.add(m); lamps.push(m); }
  const red = new THREE.PointLight(0xff2a10, 1.2, 4, 2); red.position.set(1.25, 1.6, 0.5); g.add(red);
  const white = new THREE.PointLight(0xcfd8e8, 0, 9, 1.6); white.position.set(0, 2.4, 0.6); g.add(white);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, panel, lamps, red, white };
}

// Предметы глав: канистра, жетон, заряд, шашка
function makeItem2(kind) {
  const g = new THREE.Group();
  if (kind === 'canister') {
    const red = new THREE.MeshStandardMaterial({ color: 0x6e1a12, roughness: 0.5, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.14), red); body.position.y = 0.19; g.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0x222, metalness: 0.9, roughness: 0.3 })); cap.position.set(0.1, 0.4, 0); g.add(cap);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), red); handle.position.set(-0.04, 0.38, 0); g.add(handle);
  } else if (kind === 'token') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.006, 20), new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 1, roughness: 0.3, emissive: 0x2a1405, emissiveIntensity: 0.6 }));
    m.position.y = 0.004; g.add(m);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 4, 10), m.material); ring.position.set(0, 0.006, -0.045); ring.rotation.x = Math.PI / 2; g.add(ring);
  } else if (kind === 'charge') {
    const paper = new THREE.MeshStandardMaterial({ color: 0x8a2a1a, roughness: 0.8 });
    for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 10), paper); st.rotation.z = Math.PI / 2; st.position.set(0, 0.028 + (i % 2) * 0.045, -0.03 + (i >> 1) * 0.055); g.add(st); }
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })); tape.position.y = 0.05; g.add(tape);
    const wire = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.004, 4, 16, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: 0xc9b030 })); wire.position.set(0.1, 0.08, 0); g.add(wire);
  } else if (kind === 'flare') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0xa8261c, roughness: 0.6 }));
    m.rotation.z = Math.PI / 2; m.position.y = 0.02; g.add(m);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.04, 10), new THREE.MeshStandardMaterial({ color: 0xd8d0b0, roughness: 0.6 })); cap.rotation.z = Math.PI / 2; cap.position.set(0.12, 0.02, 0); g.add(cap);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Механизмы: насос, генератор, закладка, лампада, ворот
function makeStation(kind) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a342e, roughness: 0.5, metalness: 0.85 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x4d2c1d, roughness: 0.85, metalness: 0.5 });
  const ind = new THREE.MeshStandardMaterial({ color: 0x220806, emissive: 0xff2a10, emissiveIntensity: 0.8 });
  let light = null;
  if (kind === 'pump') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.9, 16), rust); body.position.y = 0.45; g.add(body);
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), iron); motor.position.y = 1.1; g.add(motor);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 12), rust); pipe.rotation.z = Math.PI / 2; pipe.position.set(0.7, 0.3, 0); g.add(pipe);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 6, 20), iron); wheel.position.set(0, 0.7, -0.4); g.add(wheel);
    g.userData.spin = wheel;
  } else if (kind === 'generator') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.7), new THREE.MeshStandardMaterial({ color: 0x2f3a2a, roughness: 0.6, metalness: 0.6 })); body.position.y = 0.5; g.add(body);
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 10), iron); ex.position.set(0.45, 1.2, 0.15); g.add(ex);
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, 0.02), iron); f.position.set(0, 0.35 + i * 0.15, -0.36); g.add(f); }
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.3, 0.3]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), iron); w.rotation.x = Math.PI / 2; w.position.set(sx, 0.1, sz); g.add(w); }
  } else if (kind === 'charge') {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x6a1008, roughness: 0.8, transparent: true, opacity: 0.85 }));
    mark.position.set(0, 1.2, 0.02); g.add(mark);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshStandardMaterial({ color: 0x050505 })); hole.position.set(0, 1.2, 0.03); g.add(hole);
    g.userData.wall = true;
  } else if (kind === 'lamp') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.5, 8), iron); pole.position.y = 0.75; g.add(pole);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.08, 0.15, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a6a30, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide })); bowl.position.y = 1.55; g.add(bowl);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 10), new THREE.MeshBasicMaterial({ color: 0xffb060 })); flame.position.y = 1.7; flame.visible = false; g.add(flame);
    g.userData.flame = flame;
    light = new THREE.PointLight(0xffa860, 0, 9, 1.5); light.position.y = 1.8; g.add(light);
  } else if (kind === 'winch') {
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), iron); post.position.set(s * 0.6, 0.6, 0); g.add(post); }
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.1, 16), rust); drum.rotation.z = Math.PI / 2; drum.position.y = 1.0; g.add(drum);
    const crank = new THREE.Group(); crank.position.set(0.7, 1.0, 0); g.add(crank);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), iron); arm.position.y = 0.2; crank.add(arm);
    g.userData.spin = crank;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x5a4a32 })); rope.position.set(0, 2.2, 0); g.add(rope);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), ind); lamp.position.set(0.25, kind === 'charge' ? 1.75 : 1.0, 0.3); if (kind !== 'lamp') g.add(lamp);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, ind, light };
}

// Ползун: низкое, на четырёх длинных конечностях
function makeCrawler() {
  const src = makeMonster();
  const skinMat = src.userData.P.skin;
  const g = new THREE.Group(); const P = { legs: [] };
  const body = new THREE.Group(); body.position.y = 0.5; g.add(body); P.body = body;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.55, 6, 12), skinMat); torso.rotation.x = Math.PI / 2; body.add(torso);
  const head = new THREE.Group(); head.position.set(0, 0.05, -0.42); body.add(head); P.head = head;
  const sk = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), skinMat); sk.scale.set(0.9, 1, 1.2); head.add(sk);
  const face = src.userData.P.face.clone(); face.scale.multiplyScalar(0.85); face.position.set(0, 0, -0.01); head.add(face);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffe8c0, emissiveIntensity: 2 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), eyeMat); e.position.set(s * 0.03, 0.03, -0.12); head.add(e); }
  for (let i = 0; i < 4; i++) {
    const s = i % 2 ? 1 : -1, front = i < 2;
    const hip = new THREE.Group(); hip.position.set(s * 0.12, 0, front ? -0.22 : 0.22); body.add(hip);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.5, 8), skinMat); up.position.y = 0.25; up.rotation.z = s * 0.2; hip.add(up);
    const knee = new THREE.Group(); knee.position.set(s * 0.06, 0.48, 0); hip.add(knee);
    const low = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.7, 8), skinMat); low.position.y = -0.35; knee.add(low);
    hip.rotation.z = s * 1.0; knee.rotation.z = -s * 2.1;
    P.legs.push({ hip, knee, s, front });
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.userData.P = P; g.userData.t = Math.random() * 10;
  return g;
}
function poseCrawler(c, moving, dt, speed = 1) {
  const P = c.userData.P; c.userData.t += dt * (moving ? 14 * speed : 1.5);
  const t = c.userData.t;
  P.legs.forEach((l, i) => { const ph = t + (i === 0 || i === 3 ? 0 : Math.PI); l.hip.rotation.x = Math.sin(ph) * (moving ? 0.5 : 0.05); l.hip.rotation.z = l.s * (1.0 + Math.max(0, Math.cos(ph)) * (moving ? 0.3 : 0)); });
  P.body.position.y = 0.5 + Math.abs(Math.sin(t)) * (moving ? 0.05 : 0.01);
  P.head.rotation.z = Math.sin(t * 0.7) * 0.4 + (Math.random() < 0.05 ? (Math.random() - 0.5) : 0);
}


// Записка: смятый лист с неразборчивым почерком
let NOTE_TEX = null;
function makeNote() {
  if (!NOTE_TEX) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 320; const g = c.getContext('2d');
    g.fillStyle = '#b9ad93'; g.fillRect(0, 0, 256, 320);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${60 + Math.random() * 40},${50 + Math.random() * 30},30,.08)`; g.fillRect(Math.random() * 256, Math.random() * 320, 2, 2); }
    g.strokeStyle = 'rgba(30,30,45,.75)'; g.lineWidth = 1.6;
    for (let y = 34; y < 296; y += 17) { g.beginPath(); let x = 20; g.moveTo(x, y); while (x < 230 - Math.random() * 40) { x += 4 + Math.random() * 6; g.lineTo(x, y + (Math.random() - 0.5) * 4); } g.stroke(); }
    g.fillStyle = 'rgba(70,40,20,.35)'; g.filter = 'blur(10px)'; g.beginPath(); g.ellipse(190, 250, 50, 40, 0, 0, 7); g.fill();
    NOTE_TEX = new THREE.CanvasTexture(c); NOTE_TEX.colorSpace = THREE.SRGBColorSpace; NOTE_TEX.userData.keep = true;
  }
  const geo = new THREE.PlaneGeometry(0.21, 0.28, 6, 6); const pp = geo.attributes.position;
  for (let i = 0; i < pp.count; i++) pp.setZ(i, (Math.random() - 0.5) * 0.012 + Math.abs(pp.getX(i)) * 0.06);
  geo.computeVertexNormals(); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: NOTE_TEX, roughness: 0.9, side: THREE.DoubleSide }));
  m.receiveShadow = true; return m;
}
let noteOpen = false;
function openNote(i) {
  const N = G.CH.notes; const n = N[i]; if (!n) return;
  $('noteHead').textContent = `${G.CH.title} · записка ${i + 1} из ${N.length} · ${n.date}`; $('noteText').textContent = n.text;
  $('note').classList.add('on'); noteOpen = true;
}
function closeNote() { $('note').classList.remove('on'); noteOpen = false; }
function renderJournal() {
  const box = $('jlist'); box.innerHTML = '';
  let any = false;
  CHAPTERS.forEach((C, ci) => {
    const n = ci === (G && G.ch) ? Math.max(G.notes || 0, SAVE.notes[ci] || 0) : (SAVE.notes[ci] || 0);
    for (let i = 0; i < n; i++) { any = true; const d = document.createElement('div'); d.className = 'jentry'; d.innerHTML = '<div class="lbl"></div><p></p>'; d.firstChild.textContent = `${C.title} · ${C.notes[i].date}`; d.lastChild.textContent = C.notes[i].text; box.appendChild(d); }
  });
  if (!any) box.innerHTML = '<p class="note">Пока ничего. Записки лежат на полу в штреках.</p>';
}

// ---------------- Состояние ----------------
let G = null;          // текущая игра
let net = null, isHost = false, roomCode = '', lobbyPlayers = [], mode = 'menu';
const keys = {};
let yaw = 0, pitch = 0;

function newScene() {
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { for (const k in m) if (m[k] && m[k].isTexture && !m[k].userData.keep) m[k].dispose(); m.dispose(); }); } });
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x040303, 0.08);
  if (renderPass) renderPass.scene = scene;
  if (aoPass) aoPass.scene = scene;
}

function buildGame(seed, opts = {}) {
  newScene();
  const ch = opts.ch || 0, CH = CHAPTERS[ch];
  const nFlares = opts.attract ? 0 : CH.flares;
  const maze = generateMaze(seed, CH.cells, { collect: CH.collect ? CH.collect.n : 0, stations: CH.stations ? CH.stations.n : 0, notes: CH.notes.length, batteries: CH.batteries, flares: nFlares });
  maze.seedProps = seed ^ 0x5bd1e995;
  const world = buildWorld(scene, maze, Q.tex, CH.theme);
  scene.fog.density = CH.fog;
  const waterY = world.water ? 0.22 : 0;
  scene.add(new THREE.AmbientLight(0x252c3a, 0.16));
  scene.add(new THREE.HemisphereLight(0x161b26, 0x080504, 0.1));
  scene.add(camera);
  const flash = new THREE.SpotLight(0xfff1dc, 110, 34, 0.56, 0.5, 1.6);
  flash.map = flashlightCookie();
  flash.castShadow = true; flash.shadow.mapSize.set(Q.shadow, Q.shadow); flash.shadow.bias = -0.0004; flash.shadow.normalBias = 0.02; flash.shadow.camera.near = 0.1; flash.shadow.camera.far = 34;
  const flashRig = new THREE.Group(); scene.add(flashRig);
  flash.position.set(0.22, -0.22, -0.62); flashRig.add(flash);
  const bounce = new THREE.PointLight(0xffe2c0, 2, 7, 1.6); bounce.position.set(0, 0, -1.2); flashRig.add(bounce);
  const hazeGeo = new THREE.ConeGeometry(2.6, 9, 32, 1, true); hazeGeo.translate(0, -4.5, 0); hazeGeo.rotateX(-Math.PI / 2);
  const haze = new THREE.Mesh(hazeGeo, beamMat()); haze.position.copy(flash.position); haze.frustumCulled = false; flashRig.add(haze);
  const ft = new THREE.Object3D(); ft.position.set(0, 0, -10); flashRig.add(ft); flash.target = ft;
  const hand = new THREE.Group(); camera.add(hand); hand.position.set(0.24, -0.24, -0.42);
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.26, 16), new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.85, roughness: 0.3 })); tb.rotation.x = Math.PI / 2; hand.add(tb);
  const th = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.032, 0.07, 16), new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.9, roughness: 0.25 })); th.rotation.x = Math.PI / 2; th.position.z = -0.15; hand.add(th);
  const lensM = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff2d8, emissiveIntensity: 2 });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 20), lensM); lens.position.z = -0.186; lens.rotation.y = Math.PI; hand.add(lens);
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshStandardMaterial({ color: 0x1f1a16, roughness: 0.95 })); glove.scale.set(1, 0.9, 1.6); glove.position.set(0.01, -0.02, 0.04); hand.add(glove);
  hand.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  // пыль в луче
  const dustN = Q.tex === 'low' ? 300 : 900;
  const dg = new THREE.BufferGeometry(); const dp = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dp[i * 3] = (Math.random() - 0.5) * 14; dp[i * 3 + 1] = Math.random() * WALL_H; dp[i * 3 + 2] = (Math.random() - 0.5) * 14; }
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { lpos: { value: new THREE.Vector3() }, ldir: { value: new THREE.Vector3() }, on: { value: 1 }, time: { value: 0 } },
    vertexShader: `uniform vec3 lpos, ldir; uniform float on, time; varying float vA;
      void main(){ vec3 p = position; p.x += sin(time*0.3 + p.y*3.0)*0.15; p.y += sin(time*0.2 + p.x)*0.1;
        vec4 wp = modelMatrix*vec4(p,1.0); vec3 d = wp.xyz - lpos; float L = length(d);
        float c = dot(normalize(d), ldir); vA = smoothstep(0.86, 0.97, c) * on * clamp(1.0 - L/9.0, 0.0, 1.0) * smoothstep(0.3, 1.0, L);
        vec4 mv = viewMatrix*wp; gl_PointSize = 6.0 / -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard; gl_FragColor = vec4(vec3(1.0,0.95,0.85)*vA*0.3*(1.0-d*2.0), 1.0); }`
  });
  const dust = new THREE.Points(dg, dustMat); dust.frustumCulled = false; scene.add(dust);

  const items = [];
  const R2 = (() => { let z = seed >>> 0 || 7; return () => { z = (z * 1103515245 + 12345) >>> 0; return z / 4294967296; }; })();
  const place = (m, x, y, j, kind, id) => { const c = tileCenter(x, y); c.x += (R2() - 0.5) * j; c.z += (R2() - 0.5) * j; m.position.x = c.x; m.position.z = c.z; m.position.y += waterY; m.rotation.y = R2() * 6; scene.add(m); items.push({ id, kind, mesh: m, taken: false, pos: c }); };
  if (CH.collect) maze.fuses.forEach(([x, y], i) => place(CH.collect.kind === 'fuse' ? makeItem('fuse') : makeItem2(CH.collect.kind), x, y, 0.8, CH.collect.kind, i));
  maze.flares.forEach(([x, y], i) => place(makeItem2('flare'), x, y, 0.7, 'flare', 300 + i));
  const stations = [];
  maze.stations.forEach(([x, y], i) => {
    const st = makeStation(CH.stations.kind); const c = tileCenter(x, y);
    let dir = null; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (maze.isWall(x + d[0], y + d[1])) { dir = d; break; }
    if (st.group.userData.wall && dir) { st.group.position.set(c.x + dir[0] * (TILE / 2 - 0.01), 0, c.z + dir[1] * (TILE / 2 - 0.01)); st.group.lookAt(c.x, 0, c.z); }
    else if (dir) { st.group.position.set(c.x + dir[0] * (TILE / 2 - 0.6), 0, c.z + dir[1] * (TILE / 2 - 0.6)); st.group.lookAt(c.x, 0, c.z); }
    else st.group.position.copy(c);
    scene.add(st.group); stations.push({ i, ...st, pos: new THREE.Vector3(st.group.position.x, 0, st.group.position.z), done: false });
    if (!st.group.userData.wall) world.colliders.push({ x: st.group.position.x, z: st.group.position.z, r: CH.stations.kind === 'lamp' ? 0.15 : 0.5 });
  });
  maze.notes.forEach(([x, y], i) => { const m = makeNote(); m.position.y = 0.012; place(m, x, y, 0.7, 'note', 200 + i); });
  maze.batteries.forEach(([x, y], i) => place(makeItem('bat'), x, y, 0.6, 'bat', 100 + i));
  if (hasPerk('eyes') && !opts.attract) items.forEach((it) => it.mesh.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) { o.material = o.material.clone(); o.material.emissive.setHex(0x3a2a18); o.material.emissiveIntensity = Math.max(o.material.emissiveIntensity, 0.5); } }));
  const [ex, ey] = maze.exit; let dir = [1, 0];
  for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (maze.isWall(ex + d[0], ey + d[1]) && !maze.isWall(ex - d[0], ey - d[1])) { dir = d; break; }
  const dc = tileCenter(ex, ey); const dpos = new THREE.Vector3(dc.x + dir[0] * (TILE / 2 - 0.02), 0, dc.z + dir[1] * (TILE / 2 - 0.02));
  const door = makeDoor(dpos, dir); scene.add(door.group);
  const monster = makeMonster(); monster.visible = false; scene.add(monster);
  const phantom = makeMonster(); phantom.visible = false; scene.add(phantom);
  const scareLight = new THREE.PointLight(0xffd7a0, 0, 7, 1.8); scene.add(scareLight);
  const crawlers = [];
  for (let i = 0; i < (opts.attract ? 0 : CH.crawlers); i++) { const c = makeCrawler(); c.visible = false; scene.add(c); crawlers.push({ mesh: c, pos: new THREE.Vector3(), target: new THREE.Vector3(), ry: 0, mode: 0, dest: null, field: null, pathT: 0, stunT: 0, lostT: 0, alive: false, spawnT: 30 + i * 12 }); }
  const flareLights = [];
  for (let i = 0; i < (opts.attract ? 0 : 3); i++) { const l = new THREE.PointLight(0xff3a1a, 0, 10, 1.6); scene.add(l); flareLights.push(l); }
  const slots = [];
  for (let i = 0; i < 3; i++) {
    const sl = new THREE.SpotLight(0xfff1dc, 0, 26, 0.5, 0.55, 1.6); sl.map = flash.map;
    sl.castShadow = Q.others; if (Q.others) { sl.shadow.mapSize.set(512, 512); sl.shadow.bias = -0.0005; sl.shadow.normalBias = 0.02; }
    const t = new THREE.Object3D(); scene.add(sl, t); sl.target = t; slots.push({ light: sl, target: t, used: false });
  }

  G = {
    seed, ch, CH, maze, world, flash, bounce, haze, flashRig, hand, lens: lensM, dust, dustMat, items, stations, crawlers, flareLights, flareObjs: [], door, doorPos: dpos, monster, phantom, scareLight, slots,
    collected: 0, stDone: 0, timerEnd: 0, flares: hasPerk('flares') && !opts.attract ? 2 : 0, notes: 0, holdT: 0, stun: 0, noisy: false, weak: false,
    diff: opts.diff || 0, solo: !!opts.solo, attract: !!opts.attract,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), bat: 100, stamina: 100, flashOn: true, flickerOff: false, forceOff: 0,
    down: false, fuses: 0, open: false, over: false, time: 0, stepAcc: 0, bob: 0, fear: 0, damage: 0, shake: 0, glitch: 0,
    lastSeen: -99, catchAnim: 0, reviveHold: 0, sendT: 0, pendingPick: -1, intro: 0, dripT: 2,
    players: new Map(),
    sc: { next: 45 + Math.random() * 25, faceNext: 100 + Math.random() * 60, active: null },
    m: { pos: new THREE.Vector3(), target: new THREE.Vector3(), ry: 0, fz: false, g: true, fl: false, mode: 0, gone: opts.attract ? 0 : (opts.diff ? CH.monster.grace * 0.6 : CH.monster.grace), aggroT: 0, unseenT: 0,
      frozenT: 0, flT: 0, pathT: 0, field: null, dest: null, lostT: 0, firstSpawn: true, moving: false }
  };
  return G;
}

// ---------------- Игроки ----------------
function addRemote(id, name, color, idx) {
  if (id === me.id || G.players.has(id)) return;
  const av = makeAvatar(name, color); scene.add(av.group);
  const c = spawnPoint(idx);
  const slot = G.slots.find((s) => !s.used); if (slot) slot.used = true;
  G.players.set(id, { id, name, color, pos: c.clone(), tpos: c.clone(), yaw: 0, tyaw: 0, pitch: 0, flash: true, down: false, last: performance.now(), av, slot, walk: 0, bat: 100 });
}
function spawnPoint(i) { const spots = [[1.5, 1.5], [2.5, 1.5], [1.5, 2.5], [2.5, 2.5]]; const s = spots[i % 4]; return new THREE.Vector3((s[0] + 0.5) * TILE, 0, (s[1] + 0.5) * TILE); }

// ---------------- Сеть ----------------
function send(m) { m.from = me.id; if (net) net.send(m); }
function bc(m) { send(m); handle(m, true); }
function genCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

let hostLast = 0, lobbyTimer = null;
function handle(m, local = false) {
  if (!local && m.from === me.id) return;
  if (m.from && lobbyPlayers.length && m.from !== me.id) { const lp = lobbyPlayers.find((p) => p.id === m.from); if (lp) lp.last = performance.now(); }
  if (!isHost && m.host) hostLast = performance.now();
  switch (m.t) {
    case 'hello':
      if (!isHost) break;
      if (mode === 'game') { send({ t: 'busy', to: m.from, host: 1 }); break; }
      if (!lobbyPlayers.find((p) => p.id === m.from)) {
        if (lobbyPlayers.length >= 4) { send({ t: 'busy', to: m.from, full: 1, host: 1 }); break; }
        lobbyPlayers.push({ id: m.from, name: String(m.name).slice(0, 14), color: m.color | 0, last: performance.now() });
        sound.click();
      } else { const p = lobbyPlayers.find((p) => p.id === m.from); p.name = String(m.name).slice(0, 14); p.color = m.color | 0; }
      sendLobby(); renderLobby(); break;
    case 'lobby':
      if (isHost) break;
      lobbyPlayers = m.players; renderLobby(); if (joinWait) { joinWait(); joinWait = null; } break;
    case 'busy':
      if (m.to === me.id && joinFail) { joinFail(m.full ? 'Комната заполнена (4 игрока)' : 'Игра в этой комнате уже идёт'); joinFail = null; } break;
    case 'bye':
      if (isHost) { lobbyPlayers = lobbyPlayers.filter((p) => p.id !== m.from); if (mode === 'lobby') { sendLobby(); renderLobby(); } }
      else if (m.host) { leaveToMenu('Хост закрыл комнату'); return; }
      if (G && G.players.has(m.from)) removeRemote(m.from);
      break;
    case 'start':
      if (mode === 'lobby' || mode === 'end' || local) startGame(m); break;
    case 'st': if (G && mode === 'game') onState(m); break;
    case 'pick': if (isHost && G) hostPick(m.item, m.from); break;
    case 'took': if (G) applyTook(m); break;
    case 'down': if (G) applyDown(m.id, true); break;
    case 'up': if (G) applyDown(m.id, false); break;
    case 'revive': if (isHost && G) { const p = m.id === me.id ? { down: G.down } : G.players.get(m.id); if (p && p.down) bc({ t: 'up', id: m.id, by: m.from, host: 1 }); } break;
    case 'esc': if (isHost && G && G.open && !G.over) bc({ t: 'end', win: true, by: m.from, host: 1 }); break;
    case 'end': if (G && !G.over) { G.blast = !!m.blast; if (m.blast) { G.shake = 2; sound.bang({ x: G.pos.x, y: 2, z: G.pos.z }); } endGame(m.win, m.by); } break;
    case 'drop': if (G && G.world.hangers[m.i]) dropHanger(G.world.hangers[m.i]); break;
    case 'act': if (isHost && G) hostAct(m.s, m.from); break;
    case 'done': if (G) applyDone(m.s, m.by); break;
    case 'timer': if (G) { G.timerEnd = G.time + m.sec; sound.bang({ x: G.pos.x, y: 3, z: G.pos.z }); log('Шнуры подожжены. Две минуты'); setObjective(); } break;
    case 'flare': if (G && m.from !== me.id) spawnFlare(m.p, m.v, false); break;
    case 'hit': if (G) applyHit(m.id); break;
  }
}

function sendLobby() { send({ t: 'lobby', host: 1, players: lobbyPlayers.map((p) => ({ id: p.id, name: p.name, color: p.color })) }); }

function onState(m) {
  if (m.from === me.id) return;
  let p = G.players.get(m.from);
  if (!p) return;
  p.last = performance.now();
  p.moving = Math.hypot(m.p[0] - p.tpos.x, m.p[1] - p.tpos.z) > 0.04;
  p.tpos.set(m.p[0], 0, m.p[1]); p.tyaw = m.y; p.pitch = m.pi; p.flash = !!m.f; p.running = !!m.r; p.bat = m.b; p.crouch = !!m.c; p.noisy = !!m.n; p.soft = !!m.sf;
  if (m.m && !isHost) {
    const M = G.m; const wasGone = M.g;
    M.target.set(m.m.x, 0, m.m.z); M.ry = m.m.r; M.fz = !!m.m.fz; M.g = !!m.m.g; M.fl = !!m.m.fl; M.moving = !!m.m.mv; M.mode = m.m.md | 0;
    if (wasGone && !M.g) M.pos.copy(M.target);
    if (m.m.cr) m.m.cr.forEach((c, i) => { const C = G.crawlers[i]; if (!C) return; if (!C.alive && c[3] >= 0) C.pos.set(c[0], 0, c[1]); C.alive = c[3] >= 0; C.target.set(c[0], 0, c[1]); C.ry = c[2]; C.mode = c[3]; });
  }
}

function removeRemote(id) {
  const p = G.players.get(id); if (!p) return;
  scene.remove(p.av.group); if (p.slot) { p.slot.used = false; p.slot.light.intensity = 0; }
  G.players.delete(id); log(`${p.name} отключился`);
  if (isHost) checkLose();
}

// ---------------- Лобби / меню ----------------
let setFrom = 'menu', menuFocus = -1;
let joinWait = null, joinFail = null, netMode = 'net', joinMode = 'host';
function show(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id); $('corner').style.display = id === 'menu' ? '' : 'none'; menuFocus = -1; document.querySelectorAll('.item.focus').forEach((e) => e.classList.remove('focus')); }

function renderColors() {
  const c = $('colors'); c.innerHTML = '';
  COLORS.forEach((col, i) => { const d = document.createElement('div'); d.style.background = col; if (i === S.color) d.className = 'sel'; d.onclick = () => { S.color = i; saveS(); renderColors(); }; c.appendChild(d); });
}
function renderLobby() {
  const pl = $('plist'); pl.innerHTML = '';
  lobbyPlayers.forEach((p, i) => { const d = document.createElement('div'); d.innerHTML = `<i style="background:${COLORS[p.color % COLORS.length]}"></i><span></span>${i === 0 ? '<small>хост</small>' : ''}`; d.querySelector('span').textContent = p.name + (p.id === me.id ? ' (ты)' : ''); pl.appendChild(d); });
  $('bStart').style.display = isHost ? '' : 'none';
  $('hostOpts').style.display = isHost ? '' : 'none';
  if (isHost && !$('lobbyChOpts').children.length) { const box = $('lobbyChOpts'); CHAPTERS.slice(0, SAVE.unlocked).forEach((C, i) => { const b = document.createElement('button'); b.dataset.v = i; b.textContent = `${i + 1}. ${C.title}`; box.appendChild(b); }); pickOpt('lobbyChOpts', String(Math.min(SAVE.ch, SAVE.unlocked - 1)), (v) => { $('lobbyCh').value = v; }); $('lobbyCh').value = Math.min(SAVE.ch, SAVE.unlocked - 1); }
  $('lobbyNote').textContent = isHost ? (lobbyPlayers.length < 2 ? 'Отправь код друзьям. Можно до четырёх человек.' : `В комнате ${lobbyPlayers.length} из 4.`) : 'Хост скоро начнёт.';
}

function setTab(t) {
  netMode = t; $('tNet').classList.toggle('act', t === 'net'); $('tLan').classList.toggle('act', t === 'lan');
  $('joinNet').style.display = t === 'net' ? '' : 'none'; $('joinLan').style.display = t === 'lan' ? '' : 'none';
}
function openJoin(kind) {
  joinMode = kind; $('joinErr').textContent = '';
  $('joinTitle').textContent = kind === 'host' ? 'Новая комната' : 'Присоединиться';
  $('codeBox').style.display = kind === 'host' ? 'none' : ''; $('ipBox').style.display = kind === 'host' ? 'none' : '';
  $('noteNet').textContent = kind === 'host' ? 'Получишь код из четырёх букв. Друзья вводят его у себя.' : 'Код комнаты присылает тот, кто её создал.';
  $('noteLan').textContent = kind === 'host' ? 'Для одной Wi-Fi сети или Radmin VPN. Если Windows спросит про брандмауэр, разреши доступ.' : 'Для одной Wi-Fi сети или Radmin VPN.';
  $('bGo').textContent = kind === 'host' ? 'Создать' : 'Войти';
  show('join');
}

function makeNet(code, ip) {
  if (netMode === 'lan') return new LanNet(ip || null);
  if (params.get('local')) return new LocalNet(code);
  if (params.get('rt')) return new RealtimeNet(code, params.get('rt'), 'test');
  return new RealtimeNet(code);
}

async function goOnline() {
  sound.init();
  S.nick = ($('nick').value.trim() || S.nick).slice(0, 14); saveS();
  $('joinErr').textContent = ''; $('bGo').disabled = true;
  try {
    if (net) { net.close(); net = null; }
    if (joinMode === 'host') {
      roomCode = genCode();
      net = makeNet(roomCode, null); net.onmsg = (m) => handle(m); net.onclose = () => onNetClosed();
      await net.connect();
      isHost = true; lobbyPlayers = [{ id: me.id, name: S.nick, color: S.color }];
      $('lobbyKind').textContent = netMode === 'lan' ? 'твой IP для друзей' : 'код комнаты';
      $('lobbyCode').textContent = netMode === 'lan' ? (net.info.ips[0] || '127.0.0.1') : roomCode;
      $('lobbyCode').style.fontSize = netMode === 'lan' ? '36px' : '';
      if (netMode === 'lan' && net.info.ips.length > 1) $('lobbyKind').textContent = 'IP: ' + net.info.ips.join('  /  ');
    } else {
      const code = $('code').value.trim().toUpperCase(); const ip = $('ip').value.trim();
      if (netMode === 'net' && code.length !== 4) throw new Error('Код — 4 символа');
      if (netMode === 'lan' && !ip) throw new Error('Введи IP хоста');
      roomCode = code;
      net = makeNet(code, ip); net.onmsg = (m) => handle(m); net.onclose = () => onNetClosed();
      await net.connect();
      isHost = false; lobbyPlayers = [];
      await new Promise((res, rej) => {
        joinWait = res; joinFail = (e) => rej(new Error(e));
        let n = 0; const hi = () => { send({ t: 'hello', name: S.nick, color: S.color }); };
        hi(); const iv = setInterval(() => { if (!joinWait) return clearInterval(iv); if (++n > 8) { clearInterval(iv); joinWait = null; rej(new Error('Комната не найдена')); } else hi(); }, 900);
      });
      hostLast = performance.now();
      $('lobbyKind').textContent = 'комната'; $('lobbyCode').textContent = netMode === 'lan' ? ip : code; $('lobbyCode').style.fontSize = netMode === 'lan' ? '36px' : '';
    }
    mode = 'lobby'; renderLobby(); show('lobby'); startLobbyLoop();
  } catch (e) {
    $('joinErr').textContent = e.message || String(e);
    if (net) { net.close(); net = null; }
  }
  $('bGo').disabled = false;
}

function startLobbyLoop() {
  clearInterval(lobbyTimer);
  lobbyTimer = setInterval(() => {
    if (mode !== 'lobby') return;
    const now = performance.now();
    if (isHost) {
      const before = lobbyPlayers.length;
      lobbyPlayers = lobbyPlayers.filter((p) => p.id === me.id || now - (p.last || now) < 9000);
      sendLobby(); if (before !== lobbyPlayers.length) renderLobby();
    } else {
      send({ t: 'hello', name: S.nick, color: S.color });
      if (now - hostLast > 9000) leaveToMenu('Потеряна связь с хостом');
    }
  }, 2000);
}

function onNetClosed() { if (mode === 'lobby' || mode === 'game') leaveToMenu('Соединение потеряно'); }

function leaveToMenu(msg) {
  if (net) { try { send({ t: 'bye', host: isHost ? 1 : 0 }); } catch (e) {} setTimeout(((n) => () => n.close())(net), 200); net = null; }
  clearInterval(lobbyTimer); isHost = false; lobbyPlayers = []; mode = 'menu';
  if (document.pointerLockElement) document.exitPointerLock();
  $('hud').classList.remove('on'); $('downed').classList.remove('on'); $('lockHint').style.display = 'none'; $('intro').classList.remove('on');
  startAttract(); show('menu');
  if (msg) setTimeout(() => alertMsg(msg), 50);
}
function alertMsg(msg) { const d = $('menuMsg'); d.textContent = msg; clearTimeout(alertMsg.t); alertMsg.t = setTimeout(() => { d.textContent = ''; }, 7000); }

// ---------------- Запуск игры ----------------
function startGame(m) {
  show('loading'); $('loadTxt').textContent = 'спускаемся';
  setTimeout(() => {
    setupComposerIfNeeded();
    buildGame(m.seed, { diff: m.diff, solo: m.solo, ch: m.ch | 0 });
    SAVE.ch = m.ch | 0; saveP();
    const list = m.players;
    list.forEach((p, i) => { if (p.id === me.id) { G.pos.copy(spawnPoint(i)); } else addRemote(p.id, p.name, p.color, i); });
    yaw = Math.PI * 0.75; pitch = 0; // смотрим в глубь
    G.myIndex = list.findIndex((p) => p.id === me.id);
    mode = 'game'; hostLast = performance.now();
    renderFuses(); renderTeam();
    $('hud').classList.add('on'); show(null);
    setObjective();
    const L = playIntro(G.CH); G.intro = L; G.introT0 = G.time; if (G.ch === 0) setTimeout(() => { if (G && G.intro > 0) sound.intro(); }, 10500);
    lockPointer();
  }, 60);
}

function playIntro(CH) {
  const box = $('intro'); box.innerHTML = '';
  let at = 0.4; const times = CH.intro.map((txt) => { const t0 = at; at += 1.2 + txt.length * 0.045; return t0; });
  const len = at + 2.5;
  box.classList.add('on'); box.style.animationDuration = len + 's';
  const h = document.createElement('div'); h.className = 'lbl'; h.style.marginBottom = '26px'; h.textContent = `${CH.title.toLowerCase()} · ${CH.place}`; box.appendChild(h);
  CH.intro.forEach((txt, i) => { const d = document.createElement('p'); d.textContent = txt; d.style.animationDelay = times[i] + 's'; if (txt.length < 8) d.className = 'big'; box.appendChild(d); });
  const k = document.createElement('small'); k.textContent = 'любая клавиша — пропустить'; box.appendChild(k);
  return len;
}

let composerReady = false;
function setupComposerIfNeeded() { if (!composerReady || composer._q !== S.qual) { setupComposer(); composer._q = S.qual; composerReady = true; } renderPass.scene = scene; if (aoPass) aoPass.scene = scene; }

function startSolo(ch = SAVE.ch) {
  sound.init(); S.nick = ($('nick').value.trim() || S.nick).slice(0, 14); saveS();
  if (net) { net.close(); net = null; }
  isHost = true; lobbyPlayers = [];
  startGame({ seed: (Math.random() * 1e9) | 0, diff: 0, solo: true, ch, players: [{ id: me.id, name: S.nick, color: S.color }] });
}
function renderMenu() {
  const C = CHAPTERS[Math.min(SAVE.ch, CHAPTERS.length - 1)];
  const started = SAVE.ch > 0 || SAVE.unlocked > 1 || SAVE.done;
  $('bContinue').textContent = started ? `Продолжить · ${C.title}` : 'Начать';
  $('bNew').style.display = started ? '' : 'none';
  $('bChapters').style.display = SAVE.unlocked > 1 ? '' : 'none';
}
function renderChapters() {
  const box = $('chlist'); box.innerHTML = '';
  CHAPTERS.forEach((C, i) => {
    const b = document.createElement('button'); b.className = 'item'; const open = i < SAVE.unlocked;
    b.textContent = `${i + 1}. ${C.title}`; if (!open) { b.disabled = true; b.textContent += ' · закрыта'; }
    const n = SAVE.notes[i] || 0; if (open) { const sm = document.createElement('small'); sm.textContent = `  ${C.place} · записок ${n} из ${C.notes.length}`; sm.style.cssText = 'font-family:var(--mono);font-size:12px;color:var(--faint)'; b.appendChild(sm); }
    b.onclick = () => { SAVE.ch = i; saveP(); startSolo(i); };
    box.appendChild(b);
  });
}
function choosePerks() {
  const own = new Set(SAVE.perks); const pool = Object.keys(PERKS).filter((k) => !own.has(k) && (k !== 'medic' || !G.solo));
  pool.sort(() => Math.random() - 0.5); return pool.slice(0, 3);
}

function startAttract() {
  setupComposerIfNeeded();
  const seed = 777 + Math.floor(Math.random() * 5);
  buildGame(seed, { attract: true }); mode = 'menu';
  // найти длинный прямой коридор из стартовой комнаты
  let best = { len: 0 };
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) for (const d of [[1, 0], [0, 1]]) {
    let len = 0; while (!G.maze.isWall(x + d[0] * (len + 1), y + d[1] * (len + 1))) len++;
    if (len > best.len) best = { len, x, y, d };
  }
  const c = tileCenter(best.x, best.y); G.pos.copy(c);
  yaw = Math.atan2(-best.d[0], -best.d[1]); pitch = -0.05; G.attractYaw = yaw;
  const mt = tileCenter(best.x + best.d[0] * Math.min(best.len, 5), best.y + best.d[1] * Math.min(best.len, 5));
  G.m.pos.copy(mt); G.m.target.copy(mt); G.m.g = false; G.m.fz = false; G.m.moving = false; G.m.ry = yaw + Math.PI; G.monster.visible = true;
  renderPass.scene = scene;
}

// ---------------- Логика хоста ----------------
function hostPick(itemId, by) {
  const it = G.items.find((i) => i.id === itemId); if (!it || it.taken) return;
  bc({ t: 'took', item: itemId, by, host: 1 });
}
function applyTook(m) {
  const it = G.items.find((i) => i.id === m.item); if (!it || it.taken) return;
  it.taken = true; it.mesh.visible = false;
  const who = m.by === me.id ? 'Ты' : (G.players.get(m.by) || { name: 'Кто-то' }).name;
  const C = G.CH.collect;
  if (C && it.kind === C.kind) {
    G.collected = G.items.filter((i) => i.kind === C.kind && i.taken).length;
    if (m.by === me.id) { log(`${C.one}, ${G.collected} из ${C.n}`); sound.pickup(); } else log(`${who}: ${C.one.toLowerCase()}, ${G.collected} из ${C.n}`);
    renderFuses();
    if (G.collected >= C.n) { if (G.CH.stations) log(collectDoneText()); else if (!G.open) openDoor(); }
  } else if (it.kind === 'flare') {
    if (m.by === me.id) { G.flares++; sound.battery(); log(`Сигнальная шашка (${G.flares}) — бросить на G`); hint('flare', 'G — бросить шашку. Красный свет держит её на месте и манит ползунов.'); }
  } else if (it.kind === 'note') {
    G.notes = Math.min(G.CH.notes.length, (G.notes || 0) + 1);
    if (m.by === me.id) { sound.paper(); openNote(G.notes - 1); } else log(`${who} нашёл записку`);
  } else if (m.by === me.id) { G.bat = Math.min(100, G.bat + 45); sound.battery(); log('Свежая батарейка'); }
  if (m.by === me.id) G.pendingPick = -1;
  setObjective();
}
function openDoor() { G.open = true; sound.lift(); log(G.CH.exitLabel === 'клеть' ? 'Где-то загудел подъёмник' : `Путь открыт: ${G.CH.exitLabel}`); setObjective(); }
function collectDoneText() { const k = G.CH.stations.kind; return k === 'generator' ? 'Канистры собраны. Неси к генератору' : k === 'charge' ? 'Заряды у тебя. Ищи красные метки закладок' : 'Всё собрано'; }
const ST_VERB = { pump: 'запустить насос', generator: 'залить топливо и завести', charge: 'заложить заряд', lamp: 'зажечь лампаду', winch: 'крутить ворот' };
function stationReady() { return !G.CH.collect || G.collected >= G.CH.collect.n; }
function hostAct(si, by) {
  const st = G.stations[si]; if (!st || st.done || !stationReady()) return;
  bc({ t: 'done', s: si, by, host: 1 });
}
function applyDone(si, by) {
  const st = G.stations[si]; if (!st || st.done) return;
  st.done = true; G.stDone = G.stations.filter((x) => x.done).length;
  st.ind.emissive.setHex(0x39ff6a); st.ind.emissiveIntensity = 2.5;
  const k = G.CH.stations.kind, n = G.CH.stations.n;
  if (k === 'lamp') { st.light.intensity = 7; st.group.userData.flame.visible = true; }
  if (k === 'pump' || k === 'generator') sound.lift();
  if (k === 'charge') sound.pickup();
  log(`${G.CH.stations.label[0].toUpperCase() + G.CH.stations.label.slice(1)}: ${G.stDone} из ${n}`);
  renderFuses();
  if (G.stDone >= n) {
    if (G.CH.timer) { if (isHost) bc({ t: 'timer', sec: G.CH.timer, host: 1 }); openDoor(); }
    else if (k === 'lamp') { G.weak = true; sound.distantScream({ x: G.m.pos.x, y: 1.7, z: G.m.pos.z }); openDoor(); }
    else openDoor();
  }
  setObjective();
}
function applyHit(id) {
  if (id === me.id) { G.stun = 1.3; G.bat = Math.max(0, G.bat - 25); G.shake = 1.2; G.glitch = 0.5; G.damage = 0.6; sound.screech(0.35); log('Ползун сбил тебя с ног'); }
  else { const p = G.players.get(id); if (p) sound.distantScream({ x: p.pos.x, y: 1, z: p.pos.z }); }
}
function applyDown(id, v) {
  if (id === me.id) {
    G.down = v;
    if (v) { G.catchAnim = 1.3; G.damage = 0.25; G.glitch = 1; sound.screech(1.3); }
    $('downed').classList.toggle('on', v && !G.solo && !G.over);
    if (!v) log('Тебя подняли');
  } else { const p = G.players.get(id); if (p) { p.down = v; log(v ? `${p.name} схвачен` : `${p.name} снова на ногах`); if (v) sound.distantScream({ x: p.pos.x, y: 1.6, z: p.pos.z }); } }
  renderTeam();
  if (isHost && v) checkLose();
}
function checkLose() {
  if (G.over || !isHost) return;
  const alive = (!G.down ? 1 : 0) + [...G.players.values()].filter((p) => !p.down).length;
  if (alive === 0) setTimeout(() => { if (!G.over) bc({ t: 'end', win: false, host: 1 }); }, 2200);
}

function alivePlayers() {
  const out = [];
  if (!G.down && G.intro <= 0) out.push({ id: me.id, pos: G.pos, yaw, pitch, flash: G.flashOn && G.bat > 0 && !G.flickerOff && G.forceOff <= 0, running: G.running, moving: G.vel.lengthSq() > 0.5, crouch: !!G.crouch, eye: G.eye || 1.62, noisy: G.noisy, soft: hasPerk('soft') });
  for (const p of G.players.values()) if (!p.down) out.push({ id: p.id, pos: p.tpos, yaw: p.tyaw, pitch: p.pitch, flash: p.flash, running: p.running, moving: p.moving, crouch: p.crouch, eye: p.crouch ? 1.0 : 1.6, noisy: p.noisy, soft: p.soft });
  return out;
}

const _v = new THREE.Vector3(), _f = new THREE.Vector3();
function isLitBy(p, mpos, range = 15, cone = 0.42) {
  if (!p.flash) return false;
  const eye = _v.set(p.pos.x, p.eye || 1.6, p.pos.z);
  _f.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
  for (const h of [1.8, 1.2, 0.5]) {
    const dx = mpos.x - eye.x, dy = h - eye.y, dz = mpos.z - eye.z; const d = Math.hypot(dx, dy, dz);
    if (d > range) return false;
    if ((dx * _f.x + dy * _f.y + dz * _f.z) / d < Math.cos(cone)) continue;
    if (lineOfSight(G.maze, eye, mpos)) return true;
  }
  return false;
}

function randomOpenTile(near, minD, maxD) {
  const maze = G.maze; const [nx, ny] = toTile(near); const f = bfs(maze.grid, maze.G, nx, ny); const c = [];
  for (let i = 0; i < f.length; i++) if (f[i] >= minD && f[i] <= maxD) c.push(i);
  if (!c.length) return null; const i = c[Math.floor(Math.random() * c.length)];
  return tileCenter(i % maze.G, Math.floor(i / maze.G));
}

// Режимы: 0 бродит, 1 идёт на звук, 2 гонится
function hostMonster(dt) {
  const M = G.m; const maze = G.maze;
  const alive = alivePlayers();
  if (M.g) {
    M.gone -= dt;
    if (M.gone <= 0 && alive.length) {
      const sp = findSpawn(alive, M.firstSpawn ? 12 : 8, M.firstSpawn ? 30 : 16);
      if (sp) { M.pos.copy(sp); M.target.copy(sp); M.g = false; M.frozenT = 0; M.firstSpawn = false; M.field = null; M.mode = 0; M.dest = null; }
      else M.gone = 1;
    }
    return;
  }
  const nearAny = alive.some((p) => p.pos.distanceTo(M.pos) < 10);
  const MC = G.CH.monster;
  M.flT -= dt;
  if (M.flT <= 0) { if (M.fl) { M.fl = false; M.flT = 1.5 + Math.random() * 3; } else if (nearAny && Math.random() < 0.5) { M.fl = true; M.flT = 0.25 + Math.random() * 0.5; } else M.flT = 0.6; }
  const lit = alive.some((p) => !(M.fl && p.pos.distanceTo(M.pos) < 10) && isLitBy(p, M.pos)) || inSafeLight(M.pos, 0);
  M.fz = lit;
  if (lit) {
    M.frozenT += dt; M.moving = false; M.mode = 2;
    if (M.frozenT > 9) { M.g = true; M.gone = 4 + Math.random() * 4; M.fz = false; }
    return;
  }
  M.frozenT = Math.max(0, M.frozenT - dt * 0.5);
  if (!alive.length) { M.moving = false; return; }
  // восприятие
  let seen = null, sd = 1e9;
  for (const p of alive) {
    const d = p.pos.distanceTo(M.pos);
    const sees = d < (p.flash ? 22 : p.crouch ? 2.2 : 4.5) && lineOfSight(maze, M.pos, p.pos);
    if (sees && d < sd) { sd = d; seen = p; }
    const wet = !!G.world.water && p.moving;
    const hears = d < (p.noisy ? 20 : p.running ? (p.soft ? 9 : 15) : wet ? (p.crouch ? 3 : 9) : p.moving && !p.crouch ? 4 : 0);
    if (hears && M.mode < 2) { M.mode = 1; M.dest = p.pos.clone(); M.field = null; }
  }
  if (seen) { if (M.mode !== 2) M.field = null; M.mode = 2; M.dest = seen.pos.clone(); M.lostT = 0; }
  else if (M.mode === 2) { M.lostT += dt; if (M.lostT > 4) { M.mode = 1; } }
  // агрессия: в поздних главах она сама идёт к ближайшему
  if (MC.aggro && M.mode < 2) { M.aggroT -= dt; if (M.aggroT <= 0) { M.aggroT = 6; let n = alive[0], nd = 1e9; for (const p of alive) { const dd = p.pos.distanceTo(M.pos); if (dd < nd) { nd = dd; n = p; } } M.mode = 1; M.dest = n.pos.clone(); M.field = null; } }
  // рывок: долго никто не видит и далеко — появляется ближе
  if (MC.blink && !seen) { M.unseenT += dt; if (M.unseenT > 14 && Math.min(...alive.map((p) => p.pos.distanceTo(M.pos))) > 18) { const sp = findSpawn(alive, 6, 10); if (sp) { M.pos.copy(sp); M.field = null; M.mode = 1; M.dest = alive[0].pos.clone(); } M.unseenT = 0; } } else M.unseenT = 0;
  if (!M.dest || (M.mode < 2 && Math.hypot(M.dest.x - M.pos.x, M.dest.z - M.pos.z) < 0.8)) {
    M.mode = 0; M.dest = randomOpenTile(M.pos, 4, 14) || M.pos.clone(); M.field = null;
  }
  M.pathT -= dt;
  if (M.pathT <= 0 || !M.field) { const [tx, ty] = toTile(M.dest); M.field = bfs(maze.grid, maze.G, tx, ty); M.pathT = M.mode === 2 ? 0.3 : 1.5; }
  const speed = (M.mode === 2 ? MC.speed + (G.diff ? 0.6 : 0) + (G.collected + G.stDone) * 0.05 : M.mode === 1 ? 2.6 : 1.4) * (G.weak ? 0.8 : 1);
  let goal;
  if (M.mode === 2 && seen && sd < TILE * 1.6) goal = seen.pos;
  else {
    const [mx, my] = toTile(M.pos); let best = null, bv = M.field[my * maze.G + mx];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = M.field[(my + dy) * maze.G + mx + dx]; if (v < bv) { bv = v; best = [mx + dx, my + dy]; } }
    goal = best ? tileCenter(best[0], best[1]) : M.dest;
  }
  const dx = goal.x - M.pos.x, dz = goal.z - M.pos.z, d = Math.hypot(dx, dz);
  if (d > 0.01) { const s = Math.min(d, speed * dt); M.pos.x += dx / d * s; M.pos.z += dz / d * s; M.ry = Math.atan2(-dx, -dz); }
  M.moving = true;
  for (const p of alive) {
    if (Math.hypot(p.pos.x - M.pos.x, p.pos.z - M.pos.z) < 0.85) {
      bc({ t: 'down', id: p.id, host: 1 });
      M.g = true; M.gone = 8 + Math.random() * 5; M.fz = false; M.moving = false; M.mode = 0;
      break;
    }
  }
}

// свет шашек и зажжённых лампад
function inSafeLight(pos, extra) {
  for (const f of G.flareObjs) if (f.life > 0 && f.landed && f.pos.distanceTo(pos) < 6.5 + extra && lineOfSight(G.maze, f.pos, pos)) return true;
  if (G.CH.stations && G.CH.stations.kind === 'lamp') for (const st of G.stations) if (st.done && st.pos.distanceTo(pos) < 5 + extra) return true;
  return false;
}

// ---------------- Шашки ----------------
function throwFlare() {
  if (G.flares <= 0 || G.down || G.intro > 0) return;
  G.flares--;
  const f = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch) + 0.25, -Math.cos(yaw) * Math.cos(pitch)).normalize().multiplyScalar(9);
  const p = [camera.position.x, camera.position.y - 0.2, camera.position.z], v = [f.x, f.y, f.z];
  spawnFlare(p, v, true); send({ t: 'flare', p, v });
  sound.click(); log(G.flares ? `Шашек осталось: ${G.flares}` : 'Шашек больше нет');
}
function spawnFlare(p, v, mine) {
  const mesh = makeItem2('flare'); mesh.children.forEach((c) => { if (c.material) c.material = c.material.clone(); });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6040 })); glow.position.x = 0.13; mesh.add(glow);
  scene.add(mesh);
  const fo = { mesh, pos: new THREE.Vector3(...p), vel: new THREE.Vector3(...v), life: 32, landed: false };
  G.flareObjs.push(fo); if (G.flareObjs.length > 6) { const o = G.flareObjs.shift(); scene.remove(o.mesh); }
  if (sound.ctx) sound.noise(1.2, 3000, 0.5, 0.25, sound.at(fo.pos, 1, 0.5), 'highpass');
}
function updateFlares(dt, t) {
  const floorY = G.world.water ? 0.24 : 0.03;
  for (const f of G.flareObjs) {
    f.life -= dt;
    if (!f.landed) {
      f.vel.y -= 9.8 * dt; const nx = f.pos.x + f.vel.x * dt, nz = f.pos.z + f.vel.z * dt;
      if (G.maze.isWall(Math.floor(nx / TILE), Math.floor(f.pos.z / TILE))) f.vel.x *= -0.3; else f.pos.x = nx;
      if (G.maze.isWall(Math.floor(f.pos.x / TILE), Math.floor(nz / TILE))) f.vel.z *= -0.3; else f.pos.z = nz;
      f.pos.y += f.vel.y * dt; if (f.pos.y > WALL_H - 0.1) { f.pos.y = WALL_H - 0.1; f.vel.y *= -0.3; }
      if (f.pos.y <= floorY) { f.pos.y = floorY; if (Math.abs(f.vel.y) < 1.5) { f.landed = true; f.vel.set(0, 0, 0); } else { f.vel.y *= -0.3; f.vel.x *= 0.5; f.vel.z *= 0.5; } }
      f.mesh.rotation.z += dt * 8;
    }
    if (!f.landed && f.life < 28.5) { f.pos.y = floorY; f.landed = true; f.vel.set(0, 0, 0); }
    f.mesh.position.copy(f.pos); f.mesh.visible = f.life > -3;
  }
  // свет — самым новым живым шашкам
  const lit = G.flareObjs.filter((f) => f.life > 0).slice(-G.flareLights.length);
  G.flareLights.forEach((l, i) => { const f = lit[i]; if (f) { l.position.set(f.pos.x, f.pos.y + 0.25, f.pos.z); l.intensity = (f.life < 3 ? f.life / 3 : 1) * (5 + Math.sin(t * 31 + i) * 0.8 + Math.random() * 1.2); } else l.intensity = 0; });
}

// ---------------- Ползуны (считает хост) ----------------
function hostCrawlers(dt) {
  const alive = alivePlayers(); if (!alive.length) return;
  for (const c of G.crawlers) {
    if (!c.alive) { c.spawnT -= dt; if (c.spawnT <= 0) { const sp = findSpawn(alive, 8, 20); if (sp) { c.pos.copy(sp); c.alive = true; c.mode = 0; c.dest = null; } else c.spawnT = 3; } continue; }
    if (c.stunT > 0) { c.stunT -= dt; continue; }
    // приманка: шашки
    let lure = null; for (const f of G.flareObjs) if (f.life > 0 && f.landed && f.pos.distanceTo(c.pos) < 16) { lure = f; break; }
    let tgt = null, td = 1e9;
    if (!lure) for (const p of alive) { const d = p.pos.distanceTo(c.pos); if (p.flash && d < 13 && d < td && lineOfSight(G.maze, c.pos, p.pos)) { td = d; tgt = p; } }
    if (lure) { c.mode = 1; c.dest = lure.pos.clone(); }
    else if (tgt) { c.mode = 2; c.dest = tgt.pos.clone(); c.lostT = 0; }
    else if (c.mode === 2) { c.lostT += dt; if (c.lostT > 2) c.mode = 0; }
    if (!c.dest || (c.mode === 0 && c.pos.distanceTo(c.dest) < 0.8)) { c.dest = randomOpenTile(c.pos, 3, 10) || c.pos.clone(); c.field = null; }
    c.pathT -= dt;
    if (c.pathT <= 0 || !c.field) { const [tx, ty] = toTile(c.dest); c.field = bfs(G.maze.grid, G.maze.G, tx, ty); c.pathT = c.mode === 2 ? 0.4 : 1.5; }
    let goal;
    if (c.mode === 2 && td < TILE * 1.4) goal = tgt.pos;
    else { const [mx, my] = toTile(c.pos); let best = null, bv = c.field[my * G.maze.G + mx]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = c.field[(my + dy) * G.maze.G + mx + dx]; if (v < bv) { bv = v; best = [mx + dx, my + dy]; } } goal = best ? tileCenter(best[0], best[1]) : c.dest; }
    const sp = c.mode === 2 ? 4.4 + (G.diff ? 0.5 : 0) : c.mode === 1 ? 3 : 1.3;
    const dx = goal.x - c.pos.x, dz = goal.z - c.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.05) { if (c.mode === 1 && lure && c.pos.distanceTo(lure.pos) < 1.2) { /* сидит у огня */ } else { const s2 = Math.min(d, sp * dt); c.pos.x += dx / d * s2; c.pos.z += dz / d * s2; c.ry = Math.atan2(-dx, -dz); } }
    for (const p of alive) if (Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < 0.7) {
      bc({ t: 'hit', id: p.id, host: 1 }); c.stunT = 3; c.mode = 0; c.dest = randomOpenTile(c.pos, 5, 10);
      const M = G.m; if (!M.g && M.mode < 2) { M.mode = 1; M.dest = p.pos.clone(); M.field = null; }
      break;
    }
  }
}

function findSpawn(alive, minD, maxD) {
  const maze = G.maze; const fields = alive.map((p) => { const [x, y] = toTile(p.pos); return bfs(maze.grid, maze.G, x, y); });
  const cand = [];
  for (let y = 1; y < maze.G - 1; y++) for (let x = 1; x < maze.G - 1; x++) {
    if (maze.isWall(x, y)) continue; const i = y * maze.G + x;
    const md = Math.min(...fields.map((f) => f[i]));
    if (md < minD || md > maxD) continue;
    const c = tileCenter(x, y);
    if (alive.some((p) => p.pos.distanceTo(c) < 16 && lineOfSight(maze, p.pos, c))) continue;
    cand.push(c);
  }
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
}

// ---------------- Управление ----------------
function lockPointer() { try { const r = canvas.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => canvas.requestPointerLock()); } catch (e) { canvas.requestPointerLock(); } }
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && mode === 'game' && G && !G.over && !$('settings').classList.contains('on')) {
    closeNote();
    $('pauseNote').textContent = G.solo ? '' : 'Для остальных игра идёт дальше.';
    show('pause'); G.paused = true;
  }
  if (locked && G) { G.paused = false; show(null); }
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || !G) return;
  const k = 0.0021 * S.sens;
  yaw -= e.movementX * k; pitch = clamp(pitch - e.movementY * k, -1.45, 1.45);
});
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (mode === 'game' && G && G.intro > 0 && G.time - G.introT0 > 1.2) { G.intro = 0.001; return; }
  if (mode !== 'game' || !G || G.paused) return;
  if (e.code === 'KeyF') toggleFlash();
  if (e.code === 'KeyE') { if (noteOpen) { closeNote(); return; } tryInteract(); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => {
  if (mode !== 'game' || !G) return;
  if (document.pointerLockElement !== canvas) { if (!G.over) lockPointer(); return; }
  if (e.button === 2) toggleFlash();
});
addEventListener('contextmenu', (e) => e.preventDefault());

function toggleFlash() { if (G.down) return; G.flashOn = !G.flashOn; sound.click(); }

function nearestItem() {
  let best = null, bd = 1.8;
  for (const it of G.items) { if (it.taken) continue; const d = Math.hypot(it.pos.x - G.pos.x, it.pos.z - G.pos.z); if (d < bd) { bd = d; best = it; } }
  return best;
}
function nearestStation() {
  let best = null, bd = 1.9;
  for (const st of G.stations) { if (st.done) continue; const d = Math.hypot(st.pos.x - G.pos.x, st.pos.z - G.pos.z); if (d < bd) { bd = d; best = st; } }
  return best;
}
function nearestDowned() {
  let best = null, bd = 2.0;
  for (const p of G.players.values()) { if (!p.down) continue; const d = p.pos.distanceTo(G.pos); if (d < bd) { bd = d; best = p; } }
  return best;
}
function tryInteract() {
  if (G.down || G.over) return;
  const it = nearestItem();
  if (it && G.pendingPick !== it.id) {
    G.pendingPick = it.id;
    if (isHost) hostPick(it.id, me.id); else send({ t: 'pick', item: it.id });
    setTimeout(() => { if (G && G.pendingPick === it.id) G.pendingPick = -1; }, 1500);
  }
}

// ---------------- HUD ----------------
function renderFuses() {
  const d = document.querySelector('#fuses .dots'); d.innerHTML = '';
  const C = G.CH.collect, S2 = G.CH.stations;
  const phaseCollect = C && G.collected < C.n;
  $('fuseLbl').textContent = phaseCollect ? C.label : S2 ? S2.label : (C ? C.label : '');
  const n = phaseCollect ? C.n : S2 ? S2.n : C ? C.n : 0, k = phaseCollect ? G.collected : S2 ? G.stDone : G.collected;
  for (let i = 0; i < n; i++) { const e = document.createElement('i'); if (i < k) e.className = 'on'; d.appendChild(e); }
  $('flareCnt').textContent = G.flares ? `шашки ${G.flares}` : '';
}
function renderTeam() {
  const t = $('team'); t.innerHTML = ''; if (!G || G.solo) return;
  const add = (name, color, down) => { const d = document.createElement('div'); if (down) d.className = 'down'; d.innerHTML = `<i style="background:${COLORS[color % COLORS.length]}"></i><span></span>`; d.querySelector('span').textContent = name + (down ? ', схвачен' : ''); t.appendChild(d); };
  add(S.nick + ' (ты)', S.color, G.down);
  for (const p of G.players.values()) add(p.name, p.color, p.down);
}
function setObjective() {
  if (!G) return; renderFuses();
  const C = G.CH.collect, S2 = G.CH.stations; let t = '';
  if (G.open) t = G.CH.exitLabel === 'клеть' ? 'Клеть ждёт. Найди её' : `Путь открыт. Найди ${G.CH.exitLabel === 'бадья' ? 'бадью' : G.CH.exitLabel}`;
  else if (C && G.collected < C.n) t = `Найди: ${C.label}`;
  else if (S2) t = S2.kind === 'pump' ? 'Запусти насосы' : S2.kind === 'generator' ? 'Заведи генератор' : S2.kind === 'charge' ? 'Заложи заряды у красных меток' : S2.kind === 'lamp' ? 'Зажги лампады' : 'Найди ворот и подними бадью';
  $('obj').textContent = t;
}
function log(msg, ms = 5000) { const l = $('log'); const d = document.createElement('div'); d.textContent = msg; d.style.animationDuration = ms + 'ms'; l.appendChild(d); setTimeout(() => d.remove(), ms); while (l.children.length > 4) l.firstChild.remove(); }
function flashScreen(a) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = a; f.style.background = '#fff'; requestAnimationFrame(() => { f.style.transition = 'opacity .6s'; f.style.opacity = 0; }); }

function endGame(win, by) {
  G.over = true; mode = 'end';
  if (document.pointerLockElement) document.exitPointerLock();
  $('downed').classList.remove('on'); $('hud').classList.remove('on'); $('lockHint').style.display = 'none';
  const t = Math.floor(G.time); const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
  closeNote();
  SAVE.notes[G.ch] = Math.max(SAVE.notes[G.ch] || 0, G.notes || 0);
  const last = G.ch === CHAPTERS.length - 1;
  if (win) { if (last) { SAVE.done = true; SAVE.ch = 0; } else { SAVE.ch = G.ch + 1; SAVE.unlocked = Math.max(SAVE.unlocked, G.ch + 2); } }
  saveP();
  const E = finalEnding(win, notesTotal(), G.solo, G.ch);
  if (!win && G.blast) E.text = 'Заряды сработали раньше, чем вы добежали до клети. Своды сложились, как карточный домик.';
  $('endTitle').textContent = E.title; $('endStory').textContent = E.text;
  // улучшение на выбор перед следующей главой
  const pk = $('perks'); pk.innerHTML = '';
  if (win && !last) {
    const lbl = document.createElement('div'); lbl.className = 'lbl'; lbl.textContent = 'выбери одно улучшение'; pk.appendChild(lbl);
    choosePerks().forEach((k) => { const b = document.createElement('button'); b.className = 'perk'; b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = PERKS[k].name; b.lastChild.textContent = PERKS[k].text; b.onclick = () => { if (!SAVE.perks.includes(k)) { SAVE.perks.push(k); saveP(); } pk.querySelectorAll('.perk').forEach((x) => { x.classList.toggle('sel', x === b); x.disabled = true; }); sound.select(); }; pk.appendChild(b); });
  }
  $('bNext').style.display = win && !last && (G.solo || isHost) ? '' : 'none';
  $('bAgain').textContent = win ? 'Пройти главу заново' : 'Ещё раз';
  $('endTitle').style.color = win ? '' : '#c9573f';
  const who = G.solo ? '' : by === me.id ? 'Ты вышел первым. ' : by && G.players.get(by) ? `Первым вышел ${G.players.get(by).name}. ` : '';
  $('endNote').textContent = `${who}глава ${G.ch + 1} из ${CHAPTERS.length} · ${mm}:${ss} · записок в главе ${G.notes || 0} из ${G.CH.notes.length}, всего ${notesTotal()} из ${TOTAL_NOTES}`;
  $('bAgain').style.display = (G.solo || isHost) ? '' : 'none';
  if (win) sound.liftUp();
  renderMenu();
  setTimeout(() => show('end'), win ? 300 : 1200);
}

// ---------------- Кадр ----------------
const clock = new THREE.Clock();
let netT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (!G) return;
  const t = clock.elapsedTime;
  const T0 = performance.now();
  if (mode === 'game' || mode === 'end') updateGame(dt, t); else updateAttract(dt, t);
  const T1 = performance.now();
  updateVisuals(dt, t);
  const T2 = performance.now();
  horrorPass.uniforms.time.value = t;
  if (!NORENDER) composer.render(dt);
  PERF = [T1 - T0, T2 - T1, performance.now() - T2];
  if (snapReq) { const r = snapReq; snapReq = null; r(canvas.toDataURL('image/jpeg', 0.9)); }
}
let snapReq = null, PERF = [];
const NORENDER = !!params.get('norender');

function updateAttract(dt, t) {
  yaw = G.attractYaw + Math.sin(t * 0.13) * 0.3; pitch = -0.04 + Math.sin(t * 0.21) * 0.05;
  G.flickerOff = (Math.sin(t * 13) > 0.97 && Math.sin(t * 0.7) > 0.6);
  $('title').style.opacity = G.flickerOff ? 0.4 : 1;
  G.m.fz = false; G.m.moving = false;
  camera.position.set(G.pos.x, 1.62 + Math.sin(t * 0.8) * 0.01, G.pos.z);
  G.fear = 0.25;
}

// ---------------- Пугалки (у каждого игрока свои) ----------------
const _fw = new THREE.Vector3();
function viewDir() { return _fw.set(-Math.sin(yaw), 0, -Math.cos(yaw)); }
function openAt(x, z) { return !G.maze.isWall(Math.floor(x / TILE), Math.floor(z / TILE)); }
function hidePhantom() { G.phantom.visible = false; }

function startScare(kind) {
  const sc = G.sc, P = G.phantom, f = viewDir(), pos = G.pos;
  const lightOn = G.flashOn && G.bat > 0;
  if (kind === 'cross') {
    if (!lightOn) return false;
    // ищем перекрёсток впереди в луче
    for (let d = 5; d < 13; d += 0.6) {
      const x = pos.x + f.x * d, z = pos.z + f.z * d;
      if (!openAt(x, z) || !lineOfSight(G.maze, pos, { x, z })) return false;
      const [tx, ty] = [Math.floor(x / TILE), Math.floor(z / TILE)];
      const c = tileCenter(tx, ty); const px = -f.z, pz = f.x; // перпендикуляр
      const ax = Math.round(px), az = Math.round(pz);
      if (Math.abs(ax) + Math.abs(az) !== 1) continue;
      if (!G.maze.isWall(tx + ax, ty + az) && !G.maze.isWall(tx - ax, ty - az)) {
        const from = new THREE.Vector3(c.x - ax * TILE * 1.3, 0, c.z - az * TILE * 1.3), to = new THREE.Vector3(c.x + ax * TILE * 1.3, 0, c.z + az * TILE * 1.3);
        sc.active = { kind, t: 0, from, to }; P.visible = true; P.position.copy(from); P.rotation.y = Math.atan2(-(to.x - from.x), -(to.z - from.z));
        sound.runPast(c); return true;
      }
    }
    return false;
  }
  if (kind === 'behind') {
    const bx = pos.x - f.x * 3.2, bz = pos.z - f.z * 3.2;
    if (!openAt(bx, bz) || !lineOfSight(G.maze, pos, { x: bx, z: bz })) return false;
    P.visible = true; P.position.set(bx, 0, bz); P.rotation.y = Math.atan2(bx - pos.x, bz - pos.z); poseMonster(P, 'stand', 0.016, 0, { tilt: 0.8 });
    sound.whisper({ x: pos.x - f.x * 1.2 + f.z * 0.6, y: 1.7, z: pos.z - f.z * 1.2 - f.x * 0.6 });
    sc.active = { kind, t: 0, seenT: 0 }; return true;
  }
  if (kind === 'face') {
    if (!lightOn) return false;
    G.forceOff = 1.5; sound.click(); sound.buzz({ x: pos.x, y: 1.5, z: pos.z }, 0.3);
    sc.active = { kind, t: 0 }; return true;
  }
  if (kind === 'lamp') {
    let best = null;
    for (const L of G.world.lamps) {
      const d = L.pos.distanceTo(new THREE.Vector3(pos.x, WALL_H - 0.3, pos.z));
      const to = new THREE.Vector3(L.pos.x - pos.x, 0, L.pos.z - pos.z).normalize();
      if (d > 4 && d < 13 && to.dot(f) > 0.6 && lineOfSight(G.maze, pos, L.pos)) { best = L; break; }
    }
    if (!best) return false;
    sc.active = { kind, t: 0, lamp: best };
    P.visible = true; P.position.set(best.pos.x + 0.2, 0, best.pos.z); P.rotation.y = Math.atan2(best.pos.x - pos.x, best.pos.z - pos.z); poseMonster(P, 'stand', 0.016, 0, { tilt: -0.6 });
    sound.buzz(best.pos, 1.6); return true;
  }
  if (kind === 'sound') {
    const r = Math.random(); const side = new THREE.Vector3(-f.z, 0, f.x).multiplyScalar(Math.random() < 0.5 ? -1 : 1);
    if (r < 0.3) sound.knock({ x: pos.x + side.x * 1.6, y: 1.2, z: pos.z + side.z * 1.6 });
    else if (r < 0.55) sound.bang({ x: pos.x + side.x * 12 - f.x * 6, y: 2, z: pos.z + side.z * 12 - f.z * 6 });
    else if (r < 0.8) sound.distantScream({ x: pos.x - f.x * 20 + side.x * 5, y: 1.6, z: pos.z - f.z * 20 + side.z * 5 });
    else sound.whisper({ x: pos.x + side.x * 0.8, y: 1.7, z: pos.z + side.z * 0.8 });
    return true;
  }
  return false;
}

function updateScares(dt) {
  const sc = G.sc, P = G.phantom; const A = sc.active;
  for (const h of G.world.hangers) if (h.trigger && !h.dropped && Math.hypot(h.pos.x - G.pos.x, h.pos.z - G.pos.z) < 1.3) { send({ t: 'drop', i: G.world.hangers.indexOf(h) }); dropHanger(h); }
  if (A) {
    A.t += dt;
    if (A.kind === 'cross') {
      const k = Math.min(1, A.t / 0.55); P.position.lerpVectors(A.from, A.to, k); poseMonster(P, 'chase', dt, G.time);
      if (k >= 1) { hidePhantom(); sc.active = null; G.fear = Math.max(G.fear, 0.7); }
    } else if (A.kind === 'behind') {
      if (isLitBy({ pos: G.pos, yaw, pitch, flash: G.flashOn && G.bat > 0 }, P.position, 8, 0.35)) A.seenT += dt;
      if (A.seenT > 0.18) { sound.stinger(); G.shake = 0.9; G.forceOff = 0.25; G.glitch = 0.4; hidePhantom(); sc.active = null; }
      else if (A.t > 4.5) { hidePhantom(); sc.active = null; }
    } else if (A.kind === 'face') {
      if (G.forceOff <= 0 && !A.shown) {
        A.shown = A.t; const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        P.visible = true; P.position.set(camera.position.x + f.x * 0.62, camera.position.y - 1.84, camera.position.z + f.z * 0.62);
        P.rotation.y = Math.atan2(P.position.x - camera.position.x, P.position.z - camera.position.z);
        sound.screech(0.7); G.shake = 1.4; G.glitch = 1; G.damage = 0.7;
      }
      if (A.shown) { poseMonster(P, 'scream', dt, G.time); if (A.t - A.shown > 0.42) { hidePhantom(); sc.active = null; G.forceOff = 0.6; G.fear = 1; } }
    } else if (A.kind === 'lamp') {
      const on = A.t < 1.6 && (A.t < 0.25 ? Math.random() < 0.5 : Math.random() < 0.93);
      A.lamp.mat.emissiveIntensity = on ? 3 : 0; G.scareLight.position.copy(A.lamp.pos); G.scareLight.intensity = on ? 7 : 0;
      if (A.t >= 1.6) { sound.pop(A.lamp.pos); A.lamp.mat.emissiveIntensity = 0; G.scareLight.intensity = 0; hidePhantom(); sc.active = null; }
    }
    return;
  }
  if (G.down || G.over) return;
  const mDist = G.m.g ? 99 : G.m.pos.distanceTo(G.pos);
  if (mDist < 12) { sc.next = Math.max(sc.next, G.time + 8); return; }
  if (G.time < sc.next) return;
  const pool = ['sound', 'sound', 'cross', 'cross', 'behind', 'lamp'];
  if (G.time > sc.faceNext) pool.push('face', 'face', 'face');
  const kind = pool[Math.floor(Math.random() * pool.length)];
  if (startScare(kind)) {
    sc.next = G.time + (kind === 'sound' ? 18 + Math.random() * 25 : 35 + Math.random() * 45);
    if (kind === 'face') sc.faceNext = G.time + 200 + Math.random() * 120;
  } else sc.next = G.time + 2;
}

function dropHanger(h) {
  if (h.dropped) return; h.dropped = true; h.falling = true; h.vy = 0;
  sound.chainFall({ x: h.pos.x, y: 2, z: h.pos.z });
  if (Math.hypot(h.pos.x - G.pos.x, h.pos.z - G.pos.z) < 6) { G.shake = 1; G.fear = Math.max(G.fear, 0.8); }
}

function updateGame(dt, t) {
  if (!G.over) G.time += dt;
  const M = G.m;
  // вступление
  if (G.intro > 0) {
    G.intro -= dt; G.flashOn = false;
    if (G.intro <= 0) { G.intro = 0; $('intro').classList.remove('on'); G.flashOn = true; sound.click(); setObjective(); if (G.ch === 0) hint('look', 'Пока луч фонаря на ней, она не может двигаться.'); if (G.CH.crawlers) hint('crawl', 'Ползуны идут на свет фонаря. Услышал стрекот — выключи фонарь (F).'); }
  }
  let mv = 0;
  G.stun = Math.max(0, G.stun - dt);
  if (!G.down && !G.over && !G.paused && G.intro <= 0 && G.stun <= 0) {
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    G.crouch = !!(keys.ControlLeft || keys.ControlRight || keys.KeyC);
    const run = !G.crouch && (keys.ShiftLeft || keys.ShiftRight) && G.stamina > 1 && f > 0;
    const sp = (G.crouch ? 1.5 : run ? 5.3 : 3.0) * (G.world.water ? 0.72 : 1) * (G.holding ? 0 : 1);
    const dir = new THREE.Vector3(-Math.sin(yaw) * f + Math.cos(yaw) * s, 0, -Math.cos(yaw) * f - Math.sin(yaw) * s);
    if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(sp);
    G.vel.lerp(dir, damp(12, dt));
    mv = G.vel.length();
    G.pos.addScaledVector(G.vel, dt);
    collide(G.pos, 0.32);
    G.running = run && mv > 3.5;
    G.stamina = clamp(G.stamina + (G.running ? -24 * (hasPerk('lungs') ? 0.66 : 1) : 13) * dt, 0, 100);
    G.stepAcc += mv * dt; G.bob += mv * dt * 2.3;
    if (G.stepAcc > (G.running ? 2.0 : G.crouch ? 1.3 : 1.7)) { G.stepAcc = 0; sound.step(G.running, !!G.world.water, G.crouch ? 0.3 : 1); }
  } else G.vel.set(0, 0, 0);
  if (G.flashOn && !G.down && G.intro <= 0) G.bat = Math.max(0, G.bat - dt * (G.diff ? 1.35 : 1.0) * (hasPerk('battery') ? 0.67 : 1) * (G.ch >= 2 ? 1.15 : 1));
  G.forceOff = Math.max(0, G.forceOff - dt);
  const mDist = M.g ? 99 : Math.hypot(M.pos.x - G.pos.x, M.pos.z - G.pos.z);
  let flick = false;
  if (M.fl && mDist < 10) flick = Math.random() < (hasPerk('nerves') ? 0.25 : 0.6);
  if (G.bat < 15 && G.bat > 0) flick = flick || Math.random() < (15 - G.bat) / 60;
  if (G.forceOff > 0) flick = true;
  G.flickerOff = flick;
  if (G.down) G.flashOn = false;

  updateFlares(dt, t);
  if (!isHost) for (const c of G.crawlers) c.pos.lerp(c.target, damp(10, dt));
  if (G.timerEnd && isHost && !G.over && G.time > G.timerEnd) bc({ t: 'end', win: false, blast: 1, host: 1 });
  if (isHost) { hostMonster(dt); if (G.crawlers.length) hostCrawlers(dt); }
  else {
    M.pos.lerp(M.target, damp(10, dt));
    if (performance.now() - hostLast > 10000 && !G.over) { leaveToMenu('Потеряна связь с хостом'); return; }
  }
  if (G.intro <= 0) updateScares(dt);
  // висящие и падающие тела
  for (const h of G.world.hangers) {
    if (h.falling) {
      h.vy -= 9.8 * dt; h.group.position.y += h.vy * dt;
      const bottom = h.group.position.y - 0.55 - h.len - 0.1;
      if (bottom <= 0) { h.group.position.y -= bottom; h.falling = false; h.group.rotation.z = 1.35; h.group.position.y = 0.25 + 0.55 + h.len / 2 - 0.2; }
    } else if (!h.dropped) { h.group.rotation.z = Math.sin(t * 0.6 + h.t) * 0.04; h.group.rotation.y = Math.sin(t * 0.3 + h.t) * 0.3; }
  }
  // капли
  G.dripT -= dt;
  if (G.dripT <= 0) { G.dripT = 0.6 + Math.random() * 2; const near = G.world.drips.filter((d) => d.distanceTo(G.pos) < 16); if (near.length) sound.drip(near[Math.floor(Math.random() * near.length)]); }

  const now = performance.now();
  for (const p of [...G.players.values()]) {
    p.pos.lerp(p.tpos, damp(12, dt));
    let dy = p.tyaw - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * damp(14, dt);
    if (now - p.last > 12000) removeRemote(p.id);
  }
  let prompt = '';
  $('prog').style.display = 'none';
  if (!G.down && !G.over && G.intro <= 0) {
    const it = nearestItem();
    const NAMES = { fuse: 'взять предохранитель', note: 'прочитать записку', bat: 'взять батарейку', canister: 'взять канистру', token: 'взять жетон', charge: 'взять заряд', flare: 'взять шашку' };
    if (it) prompt = `<span class="k">[E]</span>${NAMES[it.kind] || 'взять'}`;
    // механизмы: держать E
    G.noisy = false; G.holding = false;
    const st = nearestStation();
    if (st && !it) {
      if (!stationReady()) prompt = `<span class="k"></span>${G.CH.collect.label} ещё не собраны: ${G.collected} из ${G.CH.collect.n}`;
      else {
        const need = G.CH.stations.hold * (hasPerk('hands') ? 0.6 : 1);
        prompt = `<span class="k">[E]</span>держать, чтобы ${ST_VERB[G.CH.stations.kind]}`;
        if (keys.KeyE) {
          G.holding = true; G.noisy = G.CH.stations.kind !== 'lamp' && G.CH.stations.kind !== 'charge';
          G.holdT += dt; $('prog').style.display = 'block'; $('prog').firstChild.style.width = (G.holdT / need * 100) + '%';
          G.mechT = (G.mechT || 0) - dt; if (G.mechT <= 0) { G.mechT = 0.7; sound.creak({ x: st.pos.x, y: 1, z: st.pos.z }); if (st.group.userData.spin) st.group.userData.spin.rotation.z += 1.2; }
          if (G.holdT >= need) { G.holdT = 0; if (isHost) hostAct(st.i, me.id); else send({ t: 'act', s: st.i }); }
        } else G.holdT = 0;
      }
    } else G.holdT = 0;
    if (keys.KeyG && !G._g) throwFlare(); G._g = !!keys.KeyG;
    const dn = nearestDowned();
    if (dn) {
      prompt = `<span class="k">[E]</span>держать, чтобы поднять ${escapeHtml(dn.name)}`;
      if (keys.KeyE) {
        const need = hasPerk('medic') ? 1.25 : 2.5;
        G.reviveHold += dt; $('prog').style.display = 'block'; $('prog').firstChild.style.width = (G.reviveHold / need * 100) + '%';
        if (G.reviveHold >= need) { G.reviveHold = 0; if (isHost) handle({ t: 'revive', id: dn.id, from: me.id }, true); else send({ t: 'revive', id: dn.id }); }
      } else G.reviveHold = 0;
    } else G.reviveHold = 0;
    if (G.open && Math.hypot(G.doorPos.x - G.pos.x, G.doorPos.z - G.pos.z) < 1.4) {
      if (isHost) handle({ t: 'esc', from: me.id }, true); else if (!G.escSent) { G.escSent = true; send({ t: 'esc' }); setTimeout(() => { if (G) G.escSent = false; }, 1000); }
    }
  }
  $('prompt').innerHTML = prompt;
  $('lockHint').style.display = (mode === 'game' && !G.over && !G.paused && G.intro <= 0 && document.pointerLockElement !== canvas) ? 'block' : 'none';
  if (G.solo && G.down && !G.over && G.catchAnim <= 0) { sound.static_(2); endGame(false); }
  $('bat').style.width = G.bat + '%'; $('batTxt').textContent = Math.ceil(G.bat) + '%';
  $('bat').style.background = G.bat < 20 ? '#c9573f' : '';
  $('sta').style.width = G.stamina + '%';
  netT -= dt;
  if (net && netT <= 0 && !G.solo) {
    netT = 0.1;
    const msg = { t: 'st', p: [+G.pos.x.toFixed(2), +G.pos.z.toFixed(2)], y: +yaw.toFixed(3), pi: +pitch.toFixed(3), f: (G.flashOn && G.bat > 0 && !G.flickerOff) ? 1 : 0, b: Math.round(G.bat), r: G.running ? 1 : 0, c: G.crouch ? 1 : 0, n: G.noisy ? 1 : 0, sf: hasPerk('soft') ? 1 : 0 };
    if (isHost) { msg.host = 1; msg.m = { x: +M.pos.x.toFixed(2), z: +M.pos.z.toFixed(2), r: +M.ry.toFixed(2), fz: M.fz ? 1 : 0, g: M.g ? 1 : 0, fl: M.fl ? 1 : 0, mv: M.moving ? 1 : 0, md: M.mode }; if (G.crawlers.length) msg.m.cr = G.crawlers.map((c) => [+c.pos.x.toFixed(2), +c.pos.z.toFixed(2), +c.ry.toFixed(2), c.alive ? c.mode : -1]); }
    send(msg);
  }
  const bobA = G.down ? 0 : Math.min(1, mv / 3);
  G.eye = (G.eye || 1.62) + ((G.crouch && !G.down ? 1.0 : 1.62) - (G.eye || 1.62)) * damp(10, dt);
  let camY = G.eye + Math.sin(G.bob * 2) * (G.crouch ? 0.025 : 0.045) * bobA;
  if (G.down) camY = 0.45;
  G.shake = Math.max(0, G.shake - dt * 1.5);
  const sh = G.shake * 0.04 + G.fear * 0.003;
  camera.position.set(G.pos.x + (Math.random() - 0.5) * sh, camY + (Math.random() - 0.5) * sh, G.pos.z + (Math.random() - 0.5) * sh);
  let fear = 0;
  if (!M.g) fear = clamp(1 - mDist / 16, 0, 1) * (M.mode === 2 ? 1 : 0.6);
  const visible = !M.g && isLitBy({ pos: G.pos, yaw, pitch, flash: true }, M.pos) && mDist < 14;
  if (visible) {
    fear = Math.max(fear, 0.6);
    if (t - G.lastSeen > 7 && mDist < 13) { sound.stinger(); G.shake = 0.8; }
    G.lastSeen = t;
  }
  G.fear += (fear - G.fear) * damp(fear > G.fear ? 4 : 0.8, dt);
  G.damage = Math.max(0, G.damage - dt * (G.down ? 0.15 : 0.6));
  if (G.down && G.catchAnim <= 0) G.damage = Math.max(G.damage, 0.45);
  G.glitch = Math.max(0, G.glitch - dt * 2.2);
  const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  sound.setListener(camera.position, fwd);
  const mstate = M.g || G.catchAnim > 0 ? 'gone' : M.fz ? 'frozen' : M.mode === 2 ? 'chase' : 'stalk';
  sound.updateMonster(M.pos, mstate, !lineOfSight(G.maze, G.pos, M.pos), mDist, dt);
  sound.update(dt, G.fear, G.stamina < 25);
  if (M.fz && !G._wasFz && mDist < 12) sound.creak({ x: M.pos.x, y: 1.6, z: M.pos.z });
  G._wasFz = M.fz;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function collide(p, r) {
  const maze = G.maze; const tx = Math.floor(p.x / TILE), tz = Math.floor(p.z / TILE);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!maze.isWall(tx + dx, tz + dz)) continue;
    const x0 = (tx + dx) * TILE, z0 = (tz + dz) * TILE;
    const cx = clamp(p.x, x0, x0 + TILE), cz = clamp(p.z, z0, z0 + TILE);
    const ddx = p.x - cx, ddz = p.z - cz, d2 = ddx * ddx + ddz * ddz;
    if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); p.x += ddx / d * (r - d); p.z += ddz / d * (r - d); }
  }
  for (const c of G.world.colliders) {
    const ddx = p.x - c.x, ddz = p.z - c.z, d = Math.hypot(ddx, ddz), rr = r + c.r;
    if (d < rr && d > 1e-4) { p.x += ddx / d * (rr - d); p.z += ddz / d * (rr - d); }
  }
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
function updateVisuals(dt, t) {
  const M = G.m;
  if (mode !== 'game' && mode !== 'end') camera.position.set(G.pos.x, camera.position.y || 1.62, G.pos.z);
  _e.set(pitch, yaw, G.down ? 0.35 : 0); camera.quaternion.setFromEuler(_e);
  camera.fov += (S.fov + (G.running ? 6 : 0) - camera.fov) * damp(6, dt); camera.updateProjectionMatrix();
  const mon = G.monster;
  // скример при поимке: лицо вплотную
  if (G.catchAnim > 0) {
    G.catchAnim -= dt;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const k = Math.min(1, (1.3 - G.catchAnim) / 0.12);
    const dist = 1.6 - k * 1.15;
    mon.visible = true; mon.position.set(camera.position.x + fwd.x * dist, camera.position.y - 1.84, camera.position.z + fwd.z * dist);
    mon.rotation.y = Math.atan2(mon.position.x - camera.position.x, mon.position.z - camera.position.z);
    poseMonster(mon, 'scream', dt, t);
    G.scareLight.position.set(camera.position.x + fwd.x * 0.3, camera.position.y + 0.2, camera.position.z + fwd.z * 0.3); G.scareLight.intensity = 1.2 + Math.random() * 1.5;
    G.shake = 1.6; G.glitch = Math.max(G.glitch, 0.8);
    if (G.catchAnim <= 0) { G.scareLight.intensity = 0; M.pos.copy(mon.position); G.damage = 1; }
  }
  G.flashRig.position.copy(camera.position);
  G.flashRig.quaternion.slerp(camera.quaternion, damp(14, dt));
  const sway = Math.sin(G.bob) * 0.012, swayY = Math.abs(Math.cos(G.bob)) * 0.012;
  G.hand.position.set(0.24 + sway, -0.24 - swayY - (G.down ? 0.5 : 0), -0.42);
  G.hand.visible = (mode === 'game' || mode === 'end') && G.intro <= 0;
  const on = G.flashOn && G.bat > 0 && !G.flickerOff && !G.down;
  const batK = G.bat < 25 ? 0.45 + G.bat / 25 * 0.55 : 1;
  G.flash.intensity = on ? 110 * batK : 0;
  G.bounce.intensity = on ? 2 * batK : 0;
  G.haze.material.uniforms.op.value = on ? 0.45 * batK : 0; G.haze.visible = on && (mode === 'game' || mode === 'end' || mode === 'menu');
  G.lens.emissiveIntensity = on ? 2 * batK : 0;
  G.dust.position.set(Math.round(camera.position.x / 4) * 4, 0, Math.round(camera.position.z / 4) * 4);
  G.dustMat.uniforms.lpos.value.copy(camera.position);
  G.dustMat.uniforms.ldir.value.set(0, 0, -1).applyQuaternion(G.flashRig.quaternion);
  G.dustMat.uniforms.on.value = on ? batK : 0; G.dustMat.uniforms.time.value = t;
  const D = G.door;
  const tot = (G.CH.collect ? G.CH.collect.n : 0) + (G.CH.stations ? G.CH.stations.n : 0), prog = tot ? (G.collected + G.stDone) / tot : 1;
  for (let i = 0; i < 5; i++) { const lit = G.open || i < Math.floor(prog * 5); D.lamps[i].material.emissive.setHex(lit ? 0x39ff6a : 0xff2a10); D.lamps[i].material.emissiveIntensity = lit ? 2.5 : 0.6; }
  if (G.open) { D.panel.position.y = Math.min(3.6, D.panel.position.y + dt * 0.5); D.red.color.setHex(0x40ff70); D.white.intensity = Math.min(6, D.white.intensity + dt * 3); }
  // монстр
  if (G.catchAnim <= 0) {
    mon.visible = !M.g;
    mon.position.set(M.pos.x, 0, M.pos.z);
    let dr = M.ry - mon.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); mon.rotation.y += dr * damp(8, dt);
    const st = M.fz ? 'frozen' : !M.moving ? 'stand' : M.mode === 2 ? 'chase' : 'stalk';
    if (st === 'stand' && G.attract) poseMonster(mon, 'stand', dt, t, { tilt: 0.6 }); else poseMonster(mon, st, dt, t);
  }
  // глаза отражают свет фонаря
  const eyeK = (m) => { const d = m.position.distanceTo(camera.position); return on && m.visible && d < 20 && isLitBy({ pos: G.pos.clone ? camera.position : G.pos, yaw, pitch, flash: true }, m.position, 20, 0.5) ? 8 * (1 - d / 20) : 0; };
  mon.userData.P.eyeMat.emissiveIntensity = G.catchAnim > 0 ? 3 : eyeK(mon);
  G.phantom.userData.P.eyeMat.emissiveIntensity = G.phantom.visible ? Math.max(1.5, eyeK(G.phantom)) : 0;
  for (const p of G.players.values()) {
    const a = p.av; a.group.position.copy(p.pos); a.group.rotation.y = p.yaw;
    const moving = p.pos.distanceTo(p.tpos) > 0.02 && !p.down;
    if (moving) p.walk += dt * (p.running ? 11 : 8);
    a.legs[0].rotation.x = moving ? Math.sin(p.walk) * 0.6 : 0; a.legs[1].rotation.x = moving ? -Math.sin(p.walk) * 0.6 : 0;
    a.body.rotation.x = p.down ? -1.45 : 0; a.body.position.y = p.down ? 0.25 : 0; a.body.position.z = p.down ? 0.9 : 0;
    const ck = p.crouch && !p.down ? 0.66 : 1; a.body.scale.y += (ck - a.body.scale.y) * damp(10, dt);
    a.arm.rotation.x = p.down ? 0 : p.pitch;
    const pon = p.flash && !p.down;
    a.beam.visible = pon; a.glow.visible = pon; a.lens.material.color.setHex(pon ? 0xfff2d8 : 0x222222);
    a.beam.material.uniforms.op.value = pon ? 1 : 0;
    if (p.slot) {
      const L = p.slot.light; L.intensity = pon ? 60 : 0;
      const hp = new THREE.Vector3(0.27, 1.4, -0.66).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw).add(p.pos);
      L.position.copy(hp);
      const fw = new THREE.Vector3(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
      p.slot.target.position.copy(hp).addScaledVector(fw, 10);
    }
    const d = p.pos.distanceTo(G.pos);
    a.tag.material.opacity = p.down ? (Math.sin(t * 6) > 0 ? 1 : 0.3) : clamp((9 - d) / 4, 0, 0.85);
  }
  // ползуны
  for (const c of G.crawlers) {
    c.mesh.visible = c.alive; if (!c.alive) continue;
    c.mesh.position.set(c.pos.x, G.world.water ? 0.1 : 0, c.pos.z);
    let dr = c.ry - c.mesh.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); c.mesh.rotation.y += dr * damp(10, dt);
    poseCrawler(c.mesh, c.mode !== 0 || true, dt, c.mode === 2 ? 1.6 : 0.6);
    c.chT = (c.chT || 1) - dt; const d = c.pos.distanceTo(G.pos);
    if (c.chT <= 0) { c.chT = c.mode === 2 ? 0.4 + Math.random() * 0.5 : 2 + Math.random() * 4; if (d < 18) sound.chitter({ x: c.pos.x, y: 0.5, z: c.pos.z }, c.mode === 2); }
    if (c.mode === 2 && d < 10) G.fear = Math.max(G.fear, 0.5);
  }
  if (G.world.water) { const wn = G.world.water.material.normalMap; wn.offset.x = t * 0.01; wn.offset.y = t * 0.006; }
  for (const st of G.stations) if (st.done && st.light) st.light.intensity = 6.5 + Math.sin(t * 9 + st.i) * 0.4 + Math.random() * 0.5;
  horrorPass.uniforms.fear.value = G.fear;
  horrorPass.uniforms.damage.value = G.damage;
  horrorPass.uniforms.glitch.value = G.glitch;
  renderer.toneMappingExposure = S.bri;
}

// ---------------- Кнопки ----------------
$('nick').value = S.nick; renderColors();
show('menu');
$('nick').addEventListener('input', () => { S.nick = $('nick').value.trim().slice(0, 14) || S.nick; saveS(); renderProfile(); });
function renderProfile() { $('bProfile').textContent = S.nick; }
fetch('version.json').then((r) => r.json()).then((v) => { $('ver').textContent = v.version; }).catch(() => {});
renderProfile();
$('bProfile').onclick = () => { setFrom = 'menu'; openSettings(); setTimeout(() => $('nick').focus(), 30); };
function pickOpt(id, val, cb) { const box = $(id); box.querySelectorAll('button').forEach((b) => { b.classList.toggle('act', b.dataset.v === String(val)); b.onclick = () => { box.querySelectorAll('button').forEach((x) => x.classList.toggle('act', x === b)); sound.tick(); cb(b.dataset.v); }; }); }
pickOpt('diffOpts', '0', (v) => { $('diff').value = v; });
$('bContinue').onclick = () => startSolo(SAVE.ch);
$('bNew').onclick = () => { SAVE.ch = 0; SAVE.perks = []; SAVE.notes = {}; SAVE.done = false; saveP(); startSolo(0); };
$('bChapters').onclick = () => { renderChapters(); show('chapters'); };
$('bChBack').onclick = () => show('menu');
$('bNext').onclick = () => {
  const next = G.ch + 1;
  if (G.solo || !net) startSolo(next);
  else if (isHost) { lobbyPlayers = lobbyPlayers.filter((p) => p.id === me.id || G.players.has(p.id)); bc({ t: 'start', host: 1, seed: (Math.random() * 1e9) | 0, diff: G.diff, ch: next, players: lobbyPlayers.map((p) => ({ id: p.id, name: p.name, color: p.color })) }); }
};
renderMenu();
$('bHost').onclick = () => { sound.init(); openJoin('host'); };
$('bJoin').onclick = () => { sound.init(); openJoin('join'); };
$('tNet').onclick = () => setTab('net'); $('tLan').onclick = () => setTab('lan');
$('bGo').onclick = goOnline;
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') goOnline(); });
$('ip').addEventListener('keydown', (e) => { if (e.key === 'Enter') goOnline(); });
$('bBack1').onclick = () => show('menu');
$('bStart').onclick = () => { if (!isHost) return; bc({ t: 'start', host: 1, seed: (Math.random() * 1e9) | 0, diff: +$('diff').value, ch: +$('lobbyCh').value, players: lobbyPlayers.map((p) => ({ id: p.id, name: p.name, color: p.color })) }); };
$('bLeave').onclick = () => leaveToMenu();
$('bSet').onclick = () => { setFrom = 'menu'; openSettings(); };
$('bSet2').onclick = () => { setFrom = 'pause'; openSettings(); };
$('bSetBack').onclick = () => { show(setFrom); };
$('bResume').onclick = () => { lockPointer(); };
$('bJournal').onclick = () => { renderJournal(); show('journal'); };
$('bJBack').onclick = () => show('pause');
$('bToMenu').onclick = () => leaveToMenu();
$('bEndMenu').onclick = () => leaveToMenu();
$('bAgain').onclick = () => {
  if (G.solo || !net) startSolo(G.ch);
  else if (isHost) { lobbyPlayers = lobbyPlayers.filter((p) => p.id === me.id || G.players.has(p.id)); bc({ t: 'start', host: 1, seed: (Math.random() * 1e9) | 0, diff: G.diff, ch: G.ch, players: lobbyPlayers.map((p) => ({ id: p.id, name: p.name, color: p.color })) }); }
};
$('bQuit').onclick = () => { if (window.native) window.native.quit(); else window.close(); };
if (!window.native) $('bQuit').style.display = 'none';
$('bFull').onclick = () => { if (window.native) window.native.fullscreen(!document.fullscreenElement && !window.__fs); window.__fs = !window.__fs; if (!window.native) { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } };

function openSettings() {
  const bind = (id, key, fmt, cb) => { const el = $(id); el.value = S[key]; const upd = () => { S[key] = +el.value; $(id + 'V').textContent = fmt(S[key]); saveS(); cb && cb(); }; el.oninput = upd; upd(); };
  bind('sens', 'sens', (v) => v.toFixed(2));
  bind('vol', 'vol', (v) => Math.round(v * 100) + '%', () => sound.setVolume(S.vol));
  bind('bri', 'bri', (v) => Math.round(v * 100) + '%');
  bind('fov', 'fov', (v) => v + '°');
  pickOpt('qualOpts', S.qual, (v) => { S.qual = v; saveS(); });
  $('nick').value = S.nick; renderColors();
  show('settings');
}

// окно в браузере: предупредить о выходе
addEventListener('beforeunload', () => { if (net) send({ t: 'bye', host: isHost ? 1 : 0 }); });

// ---------------- Меню с клавиатуры ----------------
function menuItems() { const scr = document.querySelector('.screen.on'); return scr ? [...scr.querySelectorAll('.item')].filter((e) => e.offsetParent && !e.disabled) : []; }
function setFocus(i) { const its = menuItems(); if (!its.length) return; menuFocus = (i + its.length) % its.length; its.forEach((e, k) => e.classList.toggle('focus', k === menuFocus)); sound.tick(); }
addEventListener('keydown', (e) => {
  if (mode === 'game' && !(G && G.paused)) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text' && !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  if (e.key === 'ArrowDown') { setFocus(menuFocus + 1); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { setFocus(menuFocus < 0 ? -1 : menuFocus - 1); e.preventDefault(); }
  else if (e.key === 'Enter' && menuFocus >= 0) { const it = menuItems()[menuFocus]; if (it) it.click(); }
  else if (e.key === 'Escape') { const on = document.querySelector('.screen.on'); const back = on && { join: 'bBack1', settings: 'bSetBack', journal: 'bJBack' }[on.id]; if (back) $(back).click(); }
});
document.addEventListener('mouseover', (e) => {
  const it = e.target.closest && e.target.closest('.item'); if (!it) return;
  const its = menuItems(); const i = its.indexOf(it); if (i >= 0 && i !== menuFocus) { menuFocus = i; its.forEach((x, k) => x.classList.toggle('focus', k === i)); sound.tick(); }
});
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.item')) sound.select(); }, true);
const unlockAudio = () => { sound.init(); removeEventListener('pointerdown', unlockAudio); removeEventListener('keydown', unlockAudio); };
addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);

// ---------------- Старт ----------------
startAttract();
frame();
window.__ngs = { scare: (k) => startScare(k), perf: () => PERF, info: () => renderer.info.render, snap: () => new Promise((r) => { snapReq = r; }), get G() { return G; }, get mode() { return mode; }, me, S, startSolo, keys, setYaw: (y, p) => { yaw = y; pitch = p ?? pitch; }, handle };
