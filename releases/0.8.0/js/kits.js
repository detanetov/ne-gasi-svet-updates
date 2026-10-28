// Наборы для разных карт: текстуры стен и полов, мебель, деревья, колонны, вагоны, небо
import * as THREE from 'three';
import { makeMaps, noise2, rng } from './world.js';
import { propMats } from './props.js';

const T = 2.4, H = 3.3; // TILE, WALL_H (без циклического импорта значений)
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;

// ---------------- Текстуры ----------------
// крашеная стена: внизу масляная краска, сверху побелка; текстура на всю высоту стены (v=0 — верх)
function paintedWall(size, low, high, seed) {
  const N = noise2(seed), N2 = noise2(seed + 1), N3 = noise2(seed + 2);
  const asp = H / T;
  return makeMaps(size, (u, v) => {
    const n = N(u * 10, v * 10 * asp, 5), m = N2(u * 40, v * 40 * asp, 3);
    const line = 0.53 + (N3(u * 3, 1, 2) - 0.5) * 0.01;
    const inPaint = v > line;
    const peel = N3(u * 5 + 3, v * 5 * asp, 5);
    const flake = peel > (inPaint ? 0.71 : 0.68);
    const edge = !flake && peel > (inPaint ? 0.695 : 0.665);
    const drip = Math.max(0, N2(u * 26, v * 1.2, 3) - 0.6) * 2.5 * (1 - v * 0.4);
    const grime = Math.max(0, v - 0.86) * 4 + Math.max(0, 0.08 - v) * 5;
    let r, g, b, rough, h;
    if (flake) { const k = (inPaint ? 78 : 70) + n * 30; r = k; g = k * 0.95; b = k * 0.88; rough = 0.95; h = 0.3 + n * 0.1; } // штукатурка под краской
    else if (inPaint) { const k = 0.82 + n * 0.25; r = low[0] * k; g = low[1] * k; b = low[2] * k; rough = 0.38 + m * 0.2; h = 0.6; }
    else { const k = 0.85 + n * 0.2; r = high[0] * k; g = high[1] * k; b = high[2] * k; rough = 0.92; h = 0.55 + m * 0.05; }
    if (edge) { r *= 0.6; g *= 0.6; b *= 0.6; h = 0.7; }
    if (Math.abs(v - line) < 0.004) { r *= 0.45; g *= 0.45; b *= 0.45; } // полоса-отбивка
    const d = 1 - clamp(drip * 0.5 + grime * 0.5, 0, 0.7); r *= d; g *= d * 0.98; b *= d * 0.93;
    if (drip > 0.3) rough *= 0.6;
    return { h, r, g, b, rough };
  }, seed);
}
// кафель: ровные плитки с затиркой, сколы, отпавшие плитки
function tileWall(size, base, rows, cols, seed, band) {
  const N = noise2(seed), N2 = noise2(seed + 5);
  return makeMaps(size, (u, v) => {
    const fx = (u * cols) % 1, fy = (v * rows) % 1; const tx = Math.floor(u * cols), ty = Math.floor(v * rows);
    const grout = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.045;
    const hash = Math.abs(Math.sin((tx * 91 + ty * 37 + seed) * 12.9898) * 43758.5453) % 1;
    const missing = hash > 0.982 || (N2(u * 2, v * 2, 3) > 0.74 && hash > 0.8);
    const n = N(u * 20, v * 20, 4);
    const grime = Math.max(0, N2(u * 3, v * 1.4, 4) - 0.45) * 1.4 + Math.max(0, v - 0.7) * 0.5;
    const crack = Math.abs(N2(u * 7 + tx, v * 7 + ty, 4) - 0.5) < 0.008;
    let r, g, b, rough, h;
    if (missing) { const k = 70 + n * 40; r = k; g = k * 0.95; b = k * 0.88; rough = 0.95; h = 0.1 + n * 0.1; }
    else if (grout) { const k = 60 + n * 25; r = k; g = k * 0.95; b = k * 0.9; rough = 0.9; h = 0.25; }
    else {
      const col = band && band(ty, tx) ? band(ty, tx) : base; const k = 0.9 + hash * 0.12 + n * 0.08;
      r = col[0] * k; g = col[1] * k; b = col[2] * k; rough = 0.12 + n * 0.1; h = 0.6 - Math.pow(Math.abs(fx - 0.5) * 2, 8) * 0.06;
      if (crack) { r *= 0.4; g *= 0.4; b *= 0.4; h -= 0.15; rough = 0.8; }
    }
    const d = 1 - clamp(grime, 0, 0.75); r *= d; g *= d; b *= d * 0.95; if (grime > 0.4) rough = Math.max(rough, 0.6);
    return { h, r, g, b, rough };
  }, seed);
}
// обои: полосы с узором, разошедшиеся швы, оторванные куски, плинтус снизу
function wallpaper(size, seed) {
  const N = noise2(seed), N2 = noise2(seed + 3); const asp = H / T;
  return makeMaps(size, (u, v) => {
    const strips = 4, su = (u * strips) % 1, si = Math.floor(u * strips);
    const n = N(u * 12, v * 12 * asp, 4);
    const tear = N2(u * 4 + si * 2, v * 3 * asp, 5) > 0.63 - v * 0.08;
    const seam = su < 0.012 || su > 0.988;
    const skirt = v > 0.955;
    let r, g, b, rough, h;
    if (skirt) { const k = 40 + n * 25; return { h: v > 0.96 ? 0.7 : 0.4, r: k * 1.05, g: k * 0.72, b: k * 0.48, rough: 0.55 }; }
    if (tear) { const k = 100 + n * 40; r = k; g = k * 0.96; b = k * 0.9; rough = 0.95; h = 0.25; }
    else {
      const px = (u * 24) % 1, py = (v * 24 * asp) % 1;
      const stripe = Math.sin(u * Math.PI * 2 * 24) > 0.6;
      const medal = Math.hypot(px - 0.5, (py - 0.5) * 1.3) < 0.18 && (Math.floor(v * 24 * asp) + Math.floor(u * 24)) % 2 === 0;
      let c = [146, 118, 102];
      if (stripe) c = [126, 98, 86];
      if (medal) c = [110, 122, 98];
      const fade = 0.75 + n * 0.3; r = c[0] * fade; g = c[1] * fade; b = c[2] * fade; rough = 0.9; h = 0.55 + (medal ? 0.04 : 0);
      if (seam) { r *= 0.7; g *= 0.7; b *= 0.7; h = 0.4; }
    }
    const stain = Math.max(0, N2(u * 2 + 7, v * 1.1 * asp, 4) - 0.5) * 1.8 + Math.max(0, 0.15 - v) * 3;
    const d = 1 - clamp(stain, 0, 0.7); r *= d; g *= d * 0.95; b *= d * 0.85;
    return { h, r, g, b, rough };
  }, seed);
}
function linoleum(size, base, seed) {
  const N = noise2(seed), N2 = noise2(seed + 4);
  return makeMaps(size, (u, v) => {
    const n = N(u * 18, v * 18, 5), m = N2(u * 60, v * 60, 2);
    const sq = (Math.floor(u * 8) + Math.floor(v * 8)) % 2 === 0;
    const wear = Math.max(0, N2(u * 1.5, v * 1.5, 3) - 0.45) * 1.5;
    const tear = N(u * 4 + 9, v * 4, 5) > 0.7;
    const seam = (u * 2) % 1 < 0.004;
    let k = 0.85 + n * 0.25 + (sq ? 0.06 : 0) - wear * 0.25 + m * 0.05;
    let r = base[0] * k, g = base[1] * k, b = base[2] * k, rough = 0.4 + wear * 0.4, h = 0.55;
    if (tear) { const c = 60 + n * 40; r = c; g = c * 0.97; b = c * 0.92; rough = 0.95; h = 0.3; }
    if (seam) { r *= 0.5; g *= 0.5; b *= 0.5; h = 0.4; }
    const puddle = N2(u * 2.4 + 5, v * 2.4, 3) > 0.66; if (puddle) { rough = 0.06; r *= 0.7; g *= 0.7; b *= 0.7; }
    return { h, r, g, b, rough };
  }, seed);
}
function parquet(size, seed) {
  const N = noise2(seed), N2 = noise2(seed + 6);
  return makeMaps(size, (u, v) => {
    // ёлочка
    const s = 8, x = u * s, y = v * s;
    const a = (x + y), b2 = (x - y);
    const cell = Math.floor(a / 1) + Math.floor(b2 / 4) * 7;
    const dir = (Math.floor(a) + Math.floor(b2 / 4)) % 2 === 0;
    const fa = a % 1, fb = ((b2 % 4) + 4) % 4 / 4;
    const gap = fa < 0.04 || fa > 0.96 || fb < 0.012 || fb > 0.988;
    const hash = Math.abs(Math.sin(cell * 78.233) * 43758.5453) % 1;
    const grain = Math.sin((dir ? fb : fa) * 60 + N(u * 6, v * 6, 3) * 8) * 0.5 + 0.5;
    const n = N(u * 30, v * 30, 3);
    const wear = Math.max(0, N2(u * 1.3, v * 1.3, 3) - 0.4) * 1.2;
    const lift = N2(u * 5, v * 5, 4) > 0.72; // вздутые и выпавшие плашки
    let k = gap ? 12 : 48 + grain * 22 + hash * 26 + n * 10; k *= 1 - wear * 0.35;
    if (lift && hash > 0.5) return { h: 0.1, r: 40, g: 37, b: 33, rough: 1 };
    return { h: gap ? 0.2 : 0.55 + grain * 0.06 + (lift ? 0.15 : 0), r: k * 1.0, g: k * 0.7, b: k * 0.44, rough: gap ? 1 : 0.5 + wear * 0.4 };
  }, seed);
}
function granite(size, seed) {
  const N = noise2(seed), N2 = noise2(seed + 2);
  return makeMaps(size, (u, v) => {
    const s = 2, fx = (u * s) % 1, fy = (v * s) % 1, tx = Math.floor(u * s), ty = Math.floor(v * s);
    const gap = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.008;
    const dark = (tx + ty) % 2 === 0;
    const n = N(u * 80, v * 80, 3), m = N2(u * 7, v * 7, 4);
    const speck = n > 0.66 ? 1 : n < 0.3 ? -1 : 0;
    let k = dark ? 46 + m * 20 : 118 + m * 30; k += speck * (dark ? 16 : -30);
    const vein = Math.abs(N2(u * 3 + tx * 5, v * 3, 5) - 0.5) < 0.01;
    if (vein) k *= 0.7;
    const dirt = Math.max(0, N(u * 2, v * 2, 3) - 0.55) * 1.6;
    k *= 1 - dirt * 0.5; if (gap) k = 20;
    return { h: gap ? 0.2 : 0.5, r: k * (dark ? 0.95 : 1.02), g: k * 0.9, b: k * (dark ? 0.88 : 0.84), rough: gap ? 1 : 0.14 + dirt * 0.5 };
  }, seed);
}
function grass(size, seed) {
  const N = noise2(seed), N2 = noise2(seed + 8);
  return makeMaps(size, (u, v) => {
    const n = N(u * 14, v * 14, 5), m = N2(u * 90, v * 90, 2);
    const blade = Math.abs(Math.sin(u * 900 + n * 30) * Math.sin(v * 700 + m * 20));
    const dirt = N2(u * 2.5, v * 2.5, 4) > 0.55;
    const leaf = N(u * 40 + 3, v * 40, 2) > 0.72;
    let r, g, b;
    if (dirt) { const k = 30 + n * 30; r = k; g = k * 0.85; b = k * 0.65; }
    else { const k = 0.8 + n * 0.6 + blade * 0.3; r = 34 * k; g = 50 * k; b = 26 * k; }
    if (leaf) { r = 62 + n * 30; g = 40 + n * 15; b = 18; }
    return { h: n * 0.5 + blade * 0.3, r, g, b, rough: 0.9 };
  }, seed);
}
function plasterCeil(size, seed) {
  const N = noise2(seed), N2 = noise2(seed + 1);
  return makeMaps(size, (u, v) => {
    const n = N(u * 10, v * 10, 5);
    const stain = Math.max(0, N2(u * 2, v * 2, 4) - 0.5) * 2;
    const ring = Math.abs(N2(u * 2, v * 2, 4) - 0.6) < 0.008;
    const fall = N(u * 4 + 5, v * 4, 5) > 0.7;
    let k = fall ? 60 + n * 30 : 120 + n * 30; k *= 1 - stain * 0.45; if (ring) k *= 0.6;
    return { h: fall ? 0.2 : 0.5 + n * 0.1, r: k, g: k * 0.96 * (1 - stain * 0.1), b: k * 0.9 * (1 - stain * 0.25), rough: 0.95 };
  }, seed);
}
function concreteFloor(size, seed) {
  const N = noise2(seed), N2 = noise2(seed + 2);
  return makeMaps(size, (u, v) => {
    const n = N(u * 16, v * 16, 5), m = N2(u * 70, v * 70, 2);
    const seam = (u * 2) % 1 < 0.005 || (v * 2) % 1 < 0.005;
    const oil = Math.max(0, N2(u * 2.2, v * 2.2, 4) - 0.55) * 2;
    const crack = Math.abs(N(u * 6 + 4, v * 6, 4) - 0.5) < 0.006;
    let k = 78 + n * 40 + m * 14; k *= 1 - oil * 0.6; if (seam || crack) k *= 0.45;
    return { h: seam || crack ? 0.2 : 0.5 + n * 0.2, r: k, g: k * 0.97, b: k * 0.93, rough: 0.85 - oil * 0.6 };
  }, seed);
}
function marble(size, seed) {
  const N = noise2(seed), N2 = noise2(seed + 3);
  return makeMaps(size, (u, v) => {
    const n = N(u * 4, v * 4, 6); const vein = Math.abs(Math.sin((u + n * 1.6) * 9)) ;
    const k = 150 + n * 40 - Math.pow(1 - vein, 14) * 90; const dirt = Math.max(0, v - 0.75) * 1.2 + Math.max(0, N2(u * 3, v * 3, 3) - 0.6);
    return { h: 0.5, r: k * (1 - dirt * 0.4), g: k * 0.92 * (1 - dirt * 0.4), b: k * 0.86 * (1 - dirt * 0.45), rough: 0.12 + dirt * 0.4 };
  }, seed);
}

const cache = new Map();
const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };
export function kitTexture(name, size) {
  const k = name + size;
  switch (name) {
    case 'paintGreen': return once(k, () => paintedWall(size, [58, 92, 72], [176, 172, 158], 201));
    case 'paintBlue': return once(k, () => paintedWall(size, [52, 78, 108], [178, 176, 166], 211));
    case 'paintBunker': return once(k, () => paintedWall(size, [74, 82, 66], [150, 150, 140], 221));
    case 'paintOchre': return once(k, () => paintedWall(size, [128, 92, 48], [172, 166, 150], 231));
    case 'tileCream': return once(k, () => tileWall(size, [188, 176, 146], 6, 4, 241, (ty) => (ty === 4 ? [92, 54, 40] : null)));
    case 'tileWhite': return once(k, () => tileWall(size, [196, 198, 192], 10, 10, 251));
    case 'wallpaper': return once(k, () => wallpaper(size, 261));
    case 'linoBrown': return once(k, () => linoleum(size, [96, 62, 42], 271));
    case 'linoGray': return once(k, () => linoleum(size, [92, 96, 90], 281));
    case 'parquet': return once(k, () => parquet(size, 291));
    case 'granite': return once(k, () => granite(size, 301));
    case 'grass': return once(k, () => grass(size, 311));
    case 'plaster': return once(k, () => plasterCeil(size, 321));
    case 'concreteFloor': return once(k, () => concreteFloor(size, 331));
    case 'marble': return once(k, () => marble(size, 341));
  }
  return null;
}

// ---------------- Наборы карт ----------------
// wall: имя текстуры или старое (brick/concrete/wood/rock); wallUV: stretch — повторять по высоте, full — одна текстура на всю стену
export const KITS = {
  metro: { wall: 'tileCream', wallUV: 'stretch', floor: 'granite', frep: 1, ceil: 'plaster', pipes: true, props: ['bench', 'trail', 'tube', 'crate', 'scratch', 'bones', 'hanger', 'barrel', 'hanger2', 'web'] },
  hospital: { wall: 'paintGreen', wallUV: 'full', floor: 'linoBrown', frep: 1.5, ceil: 'plaster', props: ['bed', 'bed', 'wheel', 'locker', 'trail', 'tube', 'hanger', 'scratch', 'bed', 'hanger2', 'web'] },
  camp: { wall: 'wood', wallUV: 'stretch', floor: 'grass', frep: 2, ceil: null, outdoor: true, props: ['bed', 'bench', 'crate', 'trail', 'bones', 'hanger', 'scratch', 'bed', 'hanger2', 'web'] },
  school: { wall: 'paintBlue', wallUV: 'full', floor: 'parquet', frep: 1, ceil: 'plaster', props: ['desk', 'desk', 'locker', 'trail', 'tube', 'scratch', 'desk', 'hanger', 'hanger2', 'web'] },
  factory: { wall: 'concrete', wallUV: 'stretch', floor: 'concreteFloor', frep: 2, ceil: 'concrete', pipes: true, props: ['machine', 'barrel', 'crate', 'trail', 'tube', 'machine', 'hanger', 'scratch', 'hanger2', 'web'] },
  bunker: { wall: 'paintBunker', wallUV: 'full', floor: 'concreteFloor', frep: 2, ceil: 'concrete', pipes: true, props: ['bed', 'locker', 'barrel', 'crate', 'trail', 'lamp', 'scratch', 'hanger', 'hanger2', 'bones'] },
  depot: { wall: 'brick', wallUV: 'stretch', floor: 'concreteFloor', frep: 2, ceil: 'concrete', pipes: true, props: ['barrel', 'machine', 'crate', 'trail', 'lamp', 'hanger', 'scratch', 'barrel', 'hanger2', 'web'] },
  sanatorium: { wall: 'wallpaper', wallUV: 'full', floor: 'parquet', frep: 1, ceil: 'plaster', props: ['bed', 'wheel', 'bench', 'trail', 'tube', 'hanger', 'scratch', 'bed', 'hanger2', 'web'] },
  nii: { wall: 'tileWhite', wallUV: 'stretch', floor: 'linoGray', frep: 1.5, ceil: 'plaster', pipes: true, props: ['lab', 'lab', 'locker', 'desk', 'trail', 'tube', 'scratch', 'hanger', 'hanger2', 'bones'] },
};

// ---------------- Мебель ----------------
// у каждого предмета локальная +Z смотрит от стены, длина вдоль стены по X; возвращает { group, depth, r }
const mats = {};
function M() {
  if (mats.ok) return mats; const P = propMats();
  Object.assign(mats, {
    ok: true, P,
    tube: new THREE.MeshStandardMaterial({ color: 0xb8b6ae, roughness: 0.35, metalness: 0.8 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x5a3422, roughness: 0.85, metalness: 0.5 }),
    mattress: new THREE.MeshStandardMaterial({ map: stainTex('#8d8670', 41), roughness: 1 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 1 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fb4b0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }),
    tile: new THREE.MeshStandardMaterial({ color: 0xcfd2cc, roughness: 0.2 }),
    paintG: P.paint, steel: P.steel, wood: P.wood,
    green: new THREE.MeshStandardMaterial({ map: stainTex('#3e5a4a', 42), roughness: 0.55, metalness: 0.4 }),
    blue: new THREE.MeshStandardMaterial({ map: stainTex('#3c5470', 43), roughness: 0.55, metalness: 0.4 }),
    gray: new THREE.MeshStandardMaterial({ map: stainTex('#5c605c', 44), roughness: 0.6, metalness: 0.5 }),
    red: new THREE.MeshStandardMaterial({ map: stainTex('#6a2a20', 45), roughness: 0.6, metalness: 0.5 }),
    darkwood: new THREE.MeshStandardMaterial({ map: stainTex('#4a3020', 46), roughness: 0.6 })
  });
  return mats;
}
function stainTex(base, seed) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const R = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${R() > 0.5 ? '255,250,240' : '20,14,10'},${0.03 + R() * 0.05})`; g.fillRect(R() * 256, R() * 256, 1 + R() * 3, 1 + R() * 3); }
  g.filter = 'blur(6px)'; for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(${40 + R() * 40},${20 + R() * 20},10,${0.15 + R() * 0.25})`; g.beginPath(); g.ellipse(R() * 256, R() * 256, 10 + R() * 40, 10 + R() * 60, R() * 3, 0, 7); g.fill(); }
  g.filter = 'none'; for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(210,200,180,${0.08 + R() * 0.15})`; g.lineWidth = 1; g.beginPath(); const x = R() * 256, y = R() * 256; g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 60, y + (R() - 0.5) * 20); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cyl = (r, h, m, seg = 10, r2) => new THREE.Mesh(new THREE.CylinderGeometry(r, r2 == null ? r : r2, h, seg), m);
function tubeBetween(a, b, r, m) { const d = new THREE.Vector3().subVectors(b, a); const o = cyl(r, d.length(), m, 8); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o; }
function done(g, depth, r) { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return { group: g, depth, r }; }
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function makeBed(R) {
  const m = M(), g = new THREE.Group(); const L = 1.95, W = 0.88, tr = 0.018;
  const frame = R() < 0.5 ? m.tube : m.rust;
  for (const sx of [-1, 1]) {
    const hh = sx < 0 ? 1.0 : 0.75; // изголовье выше
    for (const sz of [-1, 1]) g.add(tubeBetween(V(sx * L / 2, 0, sz * W / 2), V(sx * L / 2, hh, sz * W / 2), tr, frame));
    g.add(tubeBetween(V(sx * L / 2, hh, -W / 2), V(sx * L / 2, hh, W / 2), tr, frame));
    g.add(tubeBetween(V(sx * L / 2, hh * 0.45, -W / 2), V(sx * L / 2, hh * 0.45, W / 2), tr, frame));
    for (let i = 1; i < 6; i++) { const z = -W / 2 + W * i / 6; g.add(tubeBetween(V(sx * L / 2, hh * 0.45, z), V(sx * L / 2, hh, z), tr * 0.6, frame)); }
  }
  for (const sz of [-1, 1]) g.add(tubeBetween(V(-L / 2, 0.42, sz * W / 2), V(L / 2, 0.42, sz * W / 2), tr * 1.2, frame));
  // сетка
  for (let i = 0; i < 9; i++) g.add(tubeBetween(V(-L / 2 + 0.05, 0.42, -W / 2 + W * (i + 0.5) / 9), V(L / 2 - 0.05, 0.4 + R() * 0.02 - 0.03, -W / 2 + W * (i + 0.5) / 9), 0.004, m.steel));
  if (R() < 0.75) {
    const mat = new THREE.Mesh(new THREE.BoxGeometry(L - 0.08, 0.13, W - 0.06, 10, 2, 4), m.mattress);
    const p = mat.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setY(i, y - Math.sin((x / L + 0.5) * Math.PI) * 0.05 + (y > 0 ? Math.sin(x * 9 + i) * 0.01 : 0)); } mat.geometry.computeVertexNormals();
    mat.position.y = 0.5; mat.rotation.y = (R() - 0.5) * 0.12; mat.rotation.z = R() < 0.3 ? 0.25 : 0; if (mat.rotation.z) mat.position.y = 0.6; g.add(mat);
    if (R() < 0.5) { const pil = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6), m.mattress); pil.scale.set(1, 0.3, 1.5); pil.position.set(-L / 2 + 0.3, 0.6, 0); g.add(pil); }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = cyl(0.04, 0.025, m.rubber, 10); w.rotation.x = Math.PI / 2; w.position.set(sx * L / 2, 0.04, sz * W / 2); g.add(w); }
  if (R() < 0.3) g.rotation.z = 0; // ровная
  return done(g, W, 0.95);
}
function makeWheelchair(R) {
  const m = M(), g = new THREE.Group(); const f = m.tube;
  for (const s of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 8, 28), m.rubber); wheel.position.set(s * 0.3, 0.3, 0); wheel.rotation.y = Math.PI / 2; g.add(wheel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.006, 6, 28), f); rim.position.copy(wheel.position); rim.rotation.y = Math.PI / 2; g.add(rim);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.add(tubeBetween(V(s * 0.3, 0.3, 0), V(s * 0.3, 0.3 + Math.sin(a) * 0.27, Math.cos(a) * 0.27), 0.003, f)); }
    g.add(tubeBetween(V(s * 0.23, 0.48, -0.25), V(s * 0.23, 0.95, -0.28), 0.012, f));
    g.add(tubeBetween(V(s * 0.23, 0.48, -0.25), V(s * 0.23, 0.48, 0.25), 0.012, f));
    g.add(tubeBetween(V(s * 0.23, 0.48, 0.25), V(s * 0.2, 0.08, 0.38), 0.012, f));
    g.add(tubeBetween(V(s * 0.23, 0.68, -0.25), V(s * 0.23, 0.68, 0.18), 0.012, f));
    const cw = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 14), m.rubber); cw.position.set(s * 0.22, 0.06, 0.3); cw.rotation.y = Math.PI / 2; g.add(cw);
  }
  const seat = box(0.46, 0.02, 0.44, m.cloth, 0, 0.49, 0); g.add(seat);
  const back = box(0.46, 0.4, 0.02, m.cloth, 0, 0.72, -0.26); back.rotation.x = -0.08; g.add(back);
  g.rotation.y = (R() - 0.5) * 1.2;
  return done(g, 0.7, 0.45);
}
function makeLocker(R) {
  const m = M(), g = new THREE.Group(); const n = 1 + Math.floor(R() * 3), w = 0.42, h = 1.8, d = 0.48;
  const pm = [m.gray, m.green, m.blue][Math.floor(R() * 3)];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (w + 0.01);
    g.add(box(w, h, 0.02, pm, x, h / 2, -d / 2 + 0.01));
    for (const s of [-1, 1]) g.add(box(0.015, h, d, pm, x + s * (w / 2 - 0.008), h / 2, 0));
    g.add(box(w, 0.015, d, pm, x, h, 0)); g.add(box(w, 0.06, d, m.black, x, 0.03, 0));
    g.add(box(w - 0.02, 0.015, d - 0.04, pm, x, h * 0.78, 0));
    // дверь — иногда открыта
    const door = new THREE.Group(); door.position.set(x - w / 2 + 0.01, 0, d / 2);
    const leaf = box(w - 0.02, h - 0.08, 0.018, pm, (w - 0.02) / 2, h / 2, 0); door.add(leaf);
    for (let k = 0; k < 5; k++) door.add(box(w * 0.5, 0.012, 0.004, m.black, w / 2, h * 0.84 + k * 0.03, 0.011));
    const hnd = box(0.02, 0.1, 0.03, m.steel, w - 0.06, h * 0.5, 0.02); door.add(hnd);
    door.rotation.y = R() < 0.35 ? -(0.4 + R() * 1.4) : 0; g.add(door);
    if (R() < 0.4) { const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.15, 0.9, 8, 1, true), m.cloth); coat.position.set(x, h * 0.78 - 0.48, -0.05); g.add(coat); }
  }
  return done(g, d, 0.25 + n * 0.22);
}
function makeDesk(R) {
  const m = M(), g = new THREE.Group(); const w = 1.1, d = 0.5;
  const legM = R() < 0.5 ? m.green : m.gray;
  const top = box(w, 0.03, d, m.wood, 0, 0.74, 0.15); top.rotation.x = 0.12; g.add(top);
  g.add(box(w, 0.025, 0.1, m.wood, 0, 0.77, -0.13));
  g.add(box(w - 0.06, 0.2, 0.02, m.wood, 0, 0.6, 0.37));
  for (const s of [-1, 1]) {
    g.add(tubeBetween(V(s * w * 0.45, 0, 0.35), V(s * w * 0.45, 0.72, 0.35), 0.02, legM));
    g.add(tubeBetween(V(s * w * 0.45, 0, -0.1), V(s * w * 0.45, 0.72, -0.1), 0.02, legM));
    g.add(tubeBetween(V(s * w * 0.45, 0.02, 0.35), V(s * w * 0.45, 0.02, -0.7), 0.02, legM));
    g.add(tubeBetween(V(s * w * 0.45, 0, -0.75), V(s * w * 0.45, 0.42, -0.75), 0.02, legM));
  }
  g.add(box(w, 0.03, 0.3, m.wood, 0, 0.42, -0.72));
  g.add(box(w, 0.15, 0.02, m.wood, 0, 0.7, -0.88));
  if (R() < 0.6) { const b = box(0.2, 0.025, 0.28, R() < 0.5 ? m.red : m.blue, (R() - 0.5) * 0.6, 0.8, 0.1); b.rotation.set(0.12, R() * 2, 0); g.add(b); }
  const grp = new THREE.Group(); grp.add(g); g.rotation.y = Math.PI; g.position.z = 0.2;
  if (R() < 0.25) { grp.rotation.z = 0; g.rotation.x = -Math.PI / 2 + 0.2; g.position.y = 0.4; } // опрокинута
  return done(grp, 1.0, 0.7);
}
function makeBench(R) {
  const m = M(), g = new THREE.Group(); const L = 1.8;
  const wm = m.darkwood;
  for (let i = 0; i < 4; i++) g.add(box(L, 0.035, 0.09, wm, 0, 0.45, -0.17 + i * 0.11));
  for (let i = 0; i < 3; i++) { const b = box(L, 0.09, 0.03, wm, 0, 0.62 + i * 0.12, -0.27 - i * 0.03); b.rotation.x = -0.15; g.add(b); }
  for (const s of [-1, 1]) {
    const leg = box(0.06, 0.45, 0.5, m.black, s * L * 0.42, 0.225, 0); g.add(leg);
    const arm = box(0.06, 0.05, 0.5, m.black, s * L * 0.46, 0.66, 0); g.add(arm);
    g.add(box(0.06, 0.5, 0.05, m.black, s * L * 0.42, 0.7, -0.27));
  }
  if (R() < 0.3) g.children.splice(1, 1);
  return done(g, 0.6, 0.9);
}
function makeMachine(R) {
  const m = M(), g = new THREE.Group(); const pm = R() < 0.6 ? m.green : m.gray;
  g.add(box(1.8, 0.75, 0.6, pm, 0, 0.375, 0));
  g.add(box(1.9, 0.05, 0.65, m.steel, 0, 0.78, 0));
  g.add(box(1.5, 0.12, 0.28, m.steel, 0.1, 0.9, 0)); // станина
  g.add(box(0.45, 0.45, 0.5, pm, -0.7, 1.05, 0)); // бабка
  const ch = cyl(0.13, 0.1, m.steel, 16); ch.rotation.z = Math.PI / 2; ch.position.set(-0.42, 1.05, 0); g.add(ch);
  const tail = box(0.25, 0.25, 0.3, pm, 0.65, 1.0, 0); g.add(tail);
  const sp = cyl(0.025, 1.1, m.steel, 8); sp.rotation.z = Math.PI / 2; sp.position.set(0.05, 1.05, 0); g.add(sp);
  for (const x of [-0.2, 0.3]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16), m.steel); wh.position.set(x, 0.92, 0.3); g.add(wh); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; g.add(tubeBetween(V(x, 0.92, 0.3), V(x + Math.cos(a) * 0.1, 0.92 + Math.sin(a) * 0.1, 0.3), 0.006, m.steel)); } }
  g.add(box(0.3, 0.2, 0.04, m.black, -0.7, 0.55, 0.31));
  const lamp = cyl(0.05, 0.12, m.black, 10, 0.08); lamp.position.set(-0.7, 1.5, 0.1); lamp.rotation.x = 0.8; g.add(lamp);
  g.add(tubeBetween(V(-0.7, 1.28, 0), V(-0.7, 1.46, 0.06), 0.01, m.black));
  // стружка
  for (let i = 0; i < 10; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.03 + R() * 0.02, 0.004, 4, 10, 4), m.steel); c.position.set((R() - 0.5) * 1.8, 0.01, 0.4 + R() * 0.3); c.rotation.set(R() * 3, R() * 3, 0); g.add(c); }
  return done(g, 0.7, 1.0);
}
function makeBarrel(R) {
  const m = M(), g = new THREE.Group(); const n = 1 + Math.floor(R() * 3);
  const cm = [m.red, m.blue, m.green, m.rust][Math.floor(R() * 4)];
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group(); const body = cyl(0.29, 0.88, cm, 20); body.position.y = 0.44; b.add(body);
    for (const y of [0.05, 0.3, 0.58, 0.83]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.012, 6, 24), cm); r.rotation.x = Math.PI / 2; r.position.y = y; b.add(r); }
    const lid = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), m.steel); lid.rotation.x = -Math.PI / 2; lid.position.y = 0.881; b.add(lid);
    const cap = cyl(0.03, 0.02, m.steel, 8); cap.position.set(0.15, 0.89, 0); b.add(cap);
    if (R() < 0.25) { b.rotation.z = Math.PI / 2; b.position.y = 0.29; b.position.x = 0.44; }
    b.position.x += (i - (n - 1) / 2) * 0.62 + (R() - 0.5) * 0.05; b.position.z = (R() - 0.5) * 0.1; b.rotation.y = R() * 6; g.add(b);
  }
  return done(g, 0.62, 0.32 + n * 0.25);
}
function makeLabTable(R) {
  const m = M(), g = new THREE.Group(); const L = 1.6, d = 0.7;
  g.add(box(L, 0.85, d - 0.05, m.gray, 0, 0.425, -0.02));
  const top = box(L + 0.04, 0.04, d, m.tile, 0, 0.87, 0); g.add(top);
  for (let i = 0; i < 3; i++) { g.add(box(L / 3 - 0.04, 0.7, 0.015, m.gray, -L / 3 + i * L / 3, 0.43, d / 2 - 0.02)); g.add(box(0.1, 0.02, 0.02, m.steel, -L / 3 + i * L / 3, 0.7, d / 2)); }
  const sink = box(0.4, 0.02, 0.35, m.steel, L * 0.3, 0.9, 0); g.add(sink);
  const tap = tubeBetween(V(L * 0.3, 0.89, -0.28), V(L * 0.3, 1.15, -0.28), 0.012, m.steel); g.add(tap); g.add(tubeBetween(V(L * 0.3, 1.15, -0.28), V(L * 0.3, 1.12, -0.12), 0.012, m.steel));
  g.add(box(L, 0.5, 0.25, m.gray, 0, 1.55, -d / 2 + 0.12)); // полка
  for (let i = 0; i < 6; i++) {
    const r = 0.03 + R() * 0.03, h = 0.1 + R() * 0.15; const f = cyl(r, h, m.glass, 10, r * (R() < 0.5 ? 1 : 0.3)); f.position.set(-L / 2 + 0.15 + R() * (L * 0.5), 0.89 + h / 2, (R() - 0.5) * 0.4);
    if (R() < 0.2) { f.rotation.z = Math.PI / 2; f.position.y = 0.89 + r; } g.add(f);
  }
  const scope = new THREE.Group(); scope.add(box(0.12, 0.03, 0.16, m.black, 0, 0, 0)); const arm = box(0.03, 0.22, 0.03, m.black, 0, 0.12, -0.05); scope.add(arm); const tube = cyl(0.025, 0.18, m.black, 10); tube.position.set(0, 0.2, 0.01); tube.rotation.x = 0.3; scope.add(tube); scope.position.set(-0.1, 0.9, 0.05); g.add(scope);
  return done(g, d, 0.85);
}
// люминесцентный светильник (мёртвый), структура как у лампы: { pos, mat, group }
function makeTube(R) {
  const m = M(), g = new THREE.Group();
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0x8a8a84, emissive: 0xdfe8ff, emissiveIntensity: 0, roughness: 0.3 });
  g.add(box(1.3, 0.06, 0.22, m.gray, 0, -0.03, 0));
  for (const s of [-1, 1]) { const t = cyl(0.016, 1.2, bulbMat, 8); t.rotation.z = Math.PI / 2; t.position.set(0, -0.08, s * 0.05); g.add(t); }
  const grid = box(1.25, 0.01, 0.2, m.tube, 0, -0.11, 0); grid.material = grid.material.clone(); grid.material.transparent = true; grid.material.opacity = 0.5; g.add(grid);
  if (R() < 0.35) { g.rotation.z = 0.35 * (R() < 0.5 ? 1 : -1); g.position.y = -0.2; }
  return { group: g, mat: bulbMat };
}

export function makeFurniture(kind, R) {
  switch (kind) {
    case 'bed': return makeBed(R);
    case 'wheel': return makeWheelchair(R);
    case 'locker': return makeLocker(R);
    case 'desk': return makeDesk(R);
    case 'bench': return makeBench(R);
    case 'machine': return makeMachine(R);
    case 'barrel': return makeBarrel(R);
    case 'lab': return makeLabTable(R);
  }
  return null;
}
export { makeTube };

// ---------------- Особые постройки ----------------
// лес: стволы и ели инстансами
export function buildTrees(scene, spots, quality, R) {
  if (!spots.length) return;
  const N = noise2(911);
  const barkMaps = makeMaps(256, (u, v) => { const n = N(u * 8, v * 40, 4); const k = 30 + n * 35; return { h: n, r: k * 0.9, g: k * 0.78, b: k * 0.66, rough: 0.95 }; }, 911);
  const bark = new THREE.MeshStandardMaterial({ ...barkMaps, roughness: 1 });
  const needle = new THREE.MeshStandardMaterial({ color: 0x1a2618, roughness: 0.95, flatShading: true });
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.26, 9, 9); trunkGeo.translate(0, 4.5, 0);
  const coneGeo = new THREE.ConeGeometry(1.4, 2.6, 9, 3);
  const cp = coneGeo.attributes.position; for (let i = 0; i < cp.count; i++) { const k = 1 + (Math.sin(i * 12.3) * 0.18); cp.setX(i, cp.getX(i) * k); cp.setZ(i, cp.getZ(i) * k); if (cp.getY(i) < -1.2) cp.setY(i, cp.getY(i) - Math.abs(Math.sin(i * 7.1)) * 0.4); } coneGeo.computeVertexNormals();
  const layers = quality === 'low' ? 3 : 5;
  const trunks = new THREE.InstancedMesh(trunkGeo, bark, spots.length), cones = new THREE.InstancedMesh(coneGeo, needle, spots.length * layers);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach(([x, z, k], i) => {
    const sc = (k || 1) * (0.8 + R() * 0.5);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6); s.set(sc, sc * (0.9 + R() * 0.3), sc); p.set(x, 0, z); m4.compose(p, q, s); trunks.setMatrixAt(i, m4);
    for (let l = 0; l < layers; l++) { const t = l / layers; const ls = sc * (1.25 - t * 0.85); s.set(ls, ls, ls); p.set(x, sc * (2.6 + t * 6.4), z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6); m4.compose(p, q, s); cones.setMatrixAt(i * layers + l, m4); }
  });
  trunks.castShadow = cones.castShadow = true; trunks.receiveShadow = cones.receiveShadow = true; scene.add(trunks, cones);
}
// небо с луной и звёздами
export function buildSky(scene) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 1024); gr.addColorStop(0, '#060912'); gr.addColorStop(0.38, '#101626'); gr.addColorStop(0.5, '#222a3c'); gr.addColorStop(0.53, '#0c0f16'); gr.addColorStop(1, '#030304'); g.fillStyle = gr; g.fillRect(0, 0, 2048, 1024);
  const R = rng(77); for (let i = 0; i < 1600; i++) { const y = R() * 480; g.fillStyle = `rgba(220,225,240,${0.2 + R() * 0.7 * (1 - y / 520)})`; const s = R() < 0.03 ? 2 : 1; g.fillRect(R() * 2048, y, s, s); }
  g.filter = 'blur(30px)'; g.fillStyle = 'rgba(180,190,220,.12)'; g.beginPath(); g.arc(1500, 220, 90, 0, 7); g.fill();
  g.filter = 'none'; g.fillStyle = '#d9d6c8'; g.beginPath(); g.arc(1500, 220, 24, 0, 7); g.fill(); g.fillStyle = 'rgba(120,118,108,.4)'; g.beginPath(); g.arc(1492, 214, 7, 0, 7); g.arc(1508, 230, 5, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  sky.onBeforeRender = (r, sc, cam) => { sky.position.copy(cam.position); sky.scale.setScalar(Math.min(1, cam.far * 0.85 / 90)); sky.updateMatrixWorld(); };
  const moon = new THREE.DirectionalLight(0x8a9ac4, 0.9); moon.position.set(60, 80, -40); scene.add(moon);
  const sh = new THREE.HemisphereLight(0x2a3450, 0x0a0c08, 0.35); scene.add(sh);
  return { sky, moon };
}
// колонны платформы: облицованный мрамором пилон с капителью
export function buildColumns(scene, tiles, texSize) {
  if (!tiles.length) return;
  const mm = kitTexture('marble', Math.min(512, texSize));
  const mat = new THREE.MeshStandardMaterial({ ...mm, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.3, metalness: 0.2 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.35, metalness: 0.9 });
  const sh = new THREE.BoxGeometry(1.7, H - 0.6, 1.7), base = new THREE.BoxGeometry(1.95, 0.3, 1.95), cap = new THREE.BoxGeometry(2.0, 0.3, 2.0), cap2 = new THREE.BoxGeometry(1.85, 0.12, 1.85);
  const I = (geo, m, n) => { const o = new THREE.InstancedMesh(geo, m, n); o.castShadow = o.receiveShadow = true; scene.add(o); return o; };
  const a = I(sh, mat, tiles.length), b = I(base, dark, tiles.length), c = I(cap, mat, tiles.length), d = I(cap2, brass, tiles.length);
  const m4 = new THREE.Matrix4();
  tiles.forEach(([x, y], i) => { const cx = x * T + T / 2, cz = y * T + T / 2; m4.makeTranslation(cx, (H - 0.6) / 2 + 0.3, cz); a.setMatrixAt(i, m4); m4.makeTranslation(cx, 0.15, cz); b.setMatrixAt(i, m4); m4.makeTranslation(cx, H - 0.15, cz); c.setMatrixAt(i, m4); m4.makeTranslation(cx, H - 0.36, cz); d.setMatrixAt(i, m4); });
}
// пригородные вагоны: кузов с окнами и полосой, крыша, тележки с колёсами
export function buildWagons(scene, runs, R) {
  const P = propMats();
  const side = (num, col) => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = col; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#8a2a1e'; g.fillRect(0, 196, 1024, 18);
    for (let x = 40; x < 980; x += 120) { g.fillStyle = '#0a0c0e'; g.fillRect(x, 50, 90, 80); g.fillStyle = 'rgba(180,200,210,.08)'; g.fillRect(x + 4, 54, 40, 72); if (R() < 0.3) { g.fillStyle = 'rgba(0,0,0,.9)'; g.beginPath(); g.moveTo(x + 20, 60); g.lineTo(x + 70, 120); g.lineTo(x + 40, 70); g.fill(); } }
    for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '90,40,20' : '0,0,0'},${R() * 0.12})`; g.fillRect(R() * 1024, R() * 256, 2 + R() * 6, 1 + R() * 4); }
    g.font = 'bold 26px "Courier New", monospace'; g.fillStyle = 'rgba(220,210,170,.8)'; g.fillText(num, 440, 180);
    g.fillStyle = 'rgba(60,70,30,.6)'; g.font = 'bold 60px sans-serif'; if (R() < 0.6) g.fillText(['ЦОЙ', 'ЗДЕСЬ БЫЛ', 'НЕ ВХОДИ', '1999'][Math.floor(R() * 4)], 100 + R() * 600, 240);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const wheelM = P.steel, roofM = new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.7, metalness: 0.6 });
  for (const run of runs) {
    const len = run.n * T - 0.4, w = 2.2, h = 2.6, base = 0.9;
    const col = ['#3d5a3f', '#4a5f6e', '#5a4a3a'][Math.floor(R() * 3)];
    const tex = side(`ЭР2-${1000 + Math.floor(R() * 8999)}`, col); tex.repeat.set(run.n / 3, 1); tex.wrapS = THREE.RepeatWrapping;
    const sm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.4 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, h, w), [sm, sm, roofM, roofM, sm, sm]); body.position.y = base + h / 2; g.add(body);
    const roof = cyl(w / 2, len, roofM, 24); roof.rotation.z = Math.PI / 2; roof.scale.set(0.22, 1, 1); roof.position.y = base + h; g.add(roof);
    g.add(box(len - 0.2, 0.35, w - 0.3, P.steel, 0, base - 0.15, 0));
    for (const bx of [-len / 2 + 1.6, len / 2 - 1.6]) {
      g.add(box(2.2, 0.25, w - 0.5, P.steel, bx, 0.55, 0));
      for (const ox of [-0.7, 0.7]) for (const s of [-1, 1]) { const wh = cyl(0.42, 0.12, wheelM, 18); wh.rotation.x = Math.PI / 2; wh.position.set(bx + ox, 0.42, s * 0.78); g.add(wh); }
    }
    g.position.set(run.x0 * T + run.n * T / 2, 0, run.y * T + T / 2);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(g);
  }
}
// крыши домиков лагеря
export function buildRoofs(scene, rooms) {
  const P = propMats(); const m = new THREE.MeshStandardMaterial({ color: 0x3a3d3a, roughness: 0.8, metalness: 0.3 });
  for (const r of rooms) {
    const w = (r.w + 2) * T + 0.6, d = (r.h + 2) * T + 0.6; const cx = (r.x0 - 1) * T + w / 2 - 0.3, cz = (r.y0 - 1) * T + d / 2 - 0.3;
    const slope = Math.hypot(d / 2, 1.4);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, slope), m); p.position.set(cx, H + 0.7, cz + s * d / 4); p.rotation.x = s * Math.atan2(1.4, d / 2); p.castShadow = true; p.receiveShadow = true; scene.add(p); }
    const ridge = box(w, 0.12, 0.2, P.wood, cx, H + 1.4, cz); scene.add(ridge);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, d - 0.6), P.wood); ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, H - 0.01, cz); ceil.receiveShadow = true; scene.add(ceil);
  }
}
