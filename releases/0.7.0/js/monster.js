// Существо: модель, кожа, лицо, анимации
import * as THREE from 'three';

function noiseFn(seed) {
  let s = seed; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const P = new Float32Array(256 * 256); for (let i = 0; i < P.length; i++) P[i] = R();
  const at = (x, y) => P[((y & 255) << 8) | (x & 255)];
  const sm = (t) => t * t * (3 - 2 * t);
  const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
  return (x, y, o = 4) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { v += n(x * f, y * f) * a; a *= 0.5; f *= 2; } return v; };
}

let SKIN = null, FACE = null;

// Кожа: бледная, с синяками, венами и грязью
function skinTextures() {
  if (SKIN) return SKIN;
  const S = 512, N = noiseFn(91), V = noiseFn(17);
  const col = document.createElement('canvas'); col.width = col.height = S;
  const nrm = document.createElement('canvas'); nrm.width = nrm.height = S;
  const rgh = document.createElement('canvas'); rgh.width = rgh.height = S;
  const ci = col.getContext('2d').createImageData(S, S), ni = nrm.getContext('2d').createImageData(S, S), ri = rgh.getContext('2d').createImageData(S, S);
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x;
    const base = N(u * 8, v * 8, 5);
    const bruise = Math.max(0, N(u * 3 + 7, v * 3, 4) - 0.55) * 2.2;
    const vein = Math.max(0, 1 - Math.abs(V(u * 6, v * 6, 4) - 0.5) * 60) * (V(u * 2 + 3, v * 2, 2) > 0.45 ? 1 : 0);
    const dirt = Math.max(0, N(u * 14 + 3, v * 14, 3) - 0.5) * 2.2;
    let r = 128 + base * 46, g = 118 + base * 40, b = 100 + base * 32;
    r -= bruise * 70; g -= bruise * 85; b -= bruise * 40;
    r -= vein * 70; g -= vein * 60; b -= vein * 20;
    r -= dirt * 60; g -= dirt * 60; b -= dirt * 55;
    const k = i * 4;
    ci.data[k] = r; ci.data[k + 1] = g; ci.data[k + 2] = b; ci.data[k + 3] = 255;
    const wet = N(u * 5 + 11, v * 5, 3) > 0.58 ? 0.25 : 0.65;
    ri.data[k] = ri.data[k + 1] = ri.data[k + 2] = wet * 255; ri.data[k + 3] = 255;
    H[i] = base * 0.6 + N(u * 40, v * 40, 3) * 0.4 + vein * 0.3;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const l = H[y * S + ((x + S - 1) % S)], r = H[y * S + ((x + 1) % S)], u = H[((y + S - 1) % S) * S + x], d = H[((y + 1) % S) * S + x];
    let nx = (l - r) * 6, ny = (u - d) * 6; const len = Math.hypot(nx, ny, 1); const k = (y * S + x) * 4;
    ni.data[k] = (nx / len * 0.5 + 0.5) * 255; ni.data[k + 1] = (-ny / len * 0.5 + 0.5) * 255; ni.data[k + 2] = (1 / len * 0.5 + 0.5) * 255; ni.data[k + 3] = 255;
  }
  col.getContext('2d').putImageData(ci, 0, 0); nrm.getContext('2d').putImageData(ni, 0, 0); rgh.getContext('2d').putImageData(ri, 0, 0);
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  SKIN = { map: T(col, true), normalMap: T(nrm), roughnessMap: T(rgh) };
  return SKIN;
}

// Лицо: впалые глазницы, разорванный рот. Рисуем слоями с размытием, без чётких «мультяшных» форм
function faceTexture() {
  if (FACE) return FACE;
  const W = 512, Hh = 512; const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d'); const N = noiseFn(5), N2 = noiseFn(12);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const img = g.createImageData(W, Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / Hh, k = (y * W + x) * 4, n = N(u * 10, v * 10, 5), m = N2(u * 30, v * 30, 3);
    // впалые щёки и виски
    const cheek = Math.exp(-(((Math.abs(u - 0.5) - 0.27) / 0.08) ** 2 + ((v - 0.6) / 0.14) ** 2));
    const temple = Math.exp(-(((Math.abs(u - 0.5) - 0.33) / 0.07) ** 2 + ((v - 0.3) / 0.1) ** 2));
    const sh = 1 - cheek * 0.45 - temple * 0.3;
    const wr = 1 - Math.max(0, 0.06 - Math.abs(Math.sin(v * 60 + n * 10))) * 2 * (v < 0.26 ? 1 : 0); // морщины на лбу
    img.data[k] = (124 + n * 46 + m * 14) * sh * wr; img.data[k + 1] = (112 + n * 40 + m * 10) * sh * wr; img.data[k + 2] = (96 + n * 32) * sh * wr; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const side = g.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(14,10,8,.95)'); side.addColorStop(0.22, 'rgba(14,10,8,0)'); side.addColorStop(0.78, 'rgba(14,10,8,0)'); side.addColorStop(1, 'rgba(14,10,8,.95)');
  g.fillStyle = side; g.fillRect(0, 0, W, Hh);
  const blob = (pts, fill, blur) => { g.save(); g.filter = `blur(${blur}px)`; g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); g.restore(); };
  const ring = (cx, cy, rx, ry, jit, n = 28) => { const out = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const j = 1 + (rnd() - 0.5) * jit; out.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]); } return out; };
  // глазницы: тёмные синяки, потом провал
  for (const [ex, ey] of [[0.385, 0.35], [0.62, 0.365]]) {
    const cx = ex * W, cy = ey * Hh;
    blob(ring(cx, cy, 64, 56, 0.25), 'rgba(40,18,20,.75)', 14);
    blob(ring(cx, cy + 4, 40, 36, 0.3), 'rgba(4,2,2,1)', 5);
    blob(ring(cx + 2, cy + 6, 9, 7, 0.2), 'rgba(170,160,130,.35)', 3); // мутный зрачок
    // подтёки
    for (let i = 0; i < 2; i++) { g.save(); g.filter = 'blur(1.5px)'; g.strokeStyle = 'rgba(20,6,5,.8)'; g.lineWidth = 3 + rnd() * 2; g.beginPath(); let x = cx - 14 + i * 22 + rnd() * 8, y = cy + 32; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 6; y += 12 + rnd() * 10; g.lineTo(x, y); } g.stroke(); g.restore(); }
  }
  // нос: провал без хряща
  blob(ring(W * 0.5, Hh * 0.53, 22, 16, 0.4), 'rgba(30,12,10,.8)', 6);
  blob(ring(W * 0.485, Hh * 0.535, 6, 9, 0.3), 'rgba(3,1,1,1)', 2);
  blob(ring(W * 0.52, Hh * 0.535, 6, 9, 0.3), 'rgba(3,1,1,1)', 2);
  // рот: рваная щель от носа до подбородка
  const mx = W * 0.5, my = Hh * 0.77;
  const mouth = []; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; const r = 1 + (N2(Math.cos(a) * 3 + 5, Math.sin(a) * 3, 3) - 0.5) * 0.6; mouth.push([mx + Math.cos(a) * 58 * r * (1 + Math.max(0, Math.sin(a)) * 0.15), my + Math.sin(a) * 96 * r]); }
  blob(mouth.map(([x, y]) => [mx + (x - mx) * 1.25, my + (y - my) * 1.12]), 'rgba(70,10,8,.85)', 10); // воспалённые края
  blob(mouth, 'rgba(25,3,3,1)', 3);
  blob(mouth.map(([x, y]) => [mx + (x - mx) * 0.7, my + (y - my) * 0.75]), 'rgba(2,0,0,1)', 8);
  // кривые зубы, часть выбита
  for (let i = 0; i < 48; i += 2) {
    if (rnd() < 0.3) continue;
    const [px, py] = mouth[i]; const dx = mx - px, dy = my - py, L = Math.hypot(dx, dy);
    const len = 14 + rnd() * 22, w = 4 + rnd() * 5, tilt = (rnd() - 0.5) * 0.6;
    const ux = dx / L, uy = dy / L; const tx = ux * Math.cos(tilt) - uy * Math.sin(tilt), ty = ux * Math.sin(tilt) + uy * Math.cos(tilt);
    const sh = 115 + rnd() * 45; g.save(); g.filter = 'blur(0.9px)';
    g.fillStyle = `rgb(${sh},${sh - 18},${sh - 70})`;
    g.beginPath(); g.moveTo(px - ty * w, py + tx * w); g.lineTo(px + ty * w, py - tx * w); g.lineTo(px + tx * len, py + ty * len); g.closePath(); g.fill(); g.restore();
  }
  // разрывы кожи от уголков рта
  for (const s of [-1, 1]) {
    g.save(); g.filter = 'blur(4px)'; g.strokeStyle = 'rgba(55,6,5,.7)'; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath();
    let x = mx + s * 50, y = my - 30; g.moveTo(x, y); for (let k = 0; k < 3; k++) { x += s * (12 + rnd() * 8); y -= 6 + rnd() * 6; g.lineTo(x, y); } g.stroke(); g.restore();
  }
  FACE = new THREE.CanvasTexture(c); FACE.colorSpace = THREE.SRGBColorSpace;
  return FACE;
}

function limb(r0, r1, len, mat, bulge = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 10, 6); g.translate(0, -len / 2, 0);
  const p = g.attributes.position, uvA = g.attributes.uv;
  for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * Math.max(0.05, 2 * Math.PI * r0 * 2.5), uvA.getY(i) * len * 2.5);
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const t = -y / len; const k = 1 + Math.sin(y * 23) * 0.06 + Math.sin(y * 7.1 + 1) * 0.05 + bulge * Math.sin(Math.min(1, t * 1.4) * Math.PI); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k * (1 - bulge * 0.3)); }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

let CLOTH = null;
function clothTextures() {
  if (CLOTH) return CLOTH;
  const S = 512, N = noiseFn(33), F = noiseFn(71);
  const col = document.createElement('canvas'); col.width = col.height = S;
  const nrm = document.createElement('canvas'); nrm.width = nrm.height = S;
  const ci = col.getContext('2d').createImageData(S, S), ni = nrm.getContext('2d').createImageData(S, S);
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x;
    const fold = Math.sin(u * Math.PI * 2 * 9 + F(u * 4, v * 2, 3) * 6) * 0.5 + 0.5;
    const weave = 0;
    const n = N(u * 16, v * 16, 5);
    const stain = Math.max(0, N(u * 3 + 5, v * 3, 4) - 0.5) * 2;
    const hem = Math.max(0, v - 0.7) / 0.3; // низ грязнее (v=1 у земли)
    let k = 92 + n * 40 + fold * 18 + weave * 100;
    let r = k, g = k * 0.93, b = k * 0.82;
    r -= stain * 55; g -= stain * 62; b -= stain * 60;
    r = r * (1 - hem * 0.55) + 50 * hem * 0.55; g = g * (1 - hem * 0.65) + 22 * hem * 0.65; b = b * (1 - hem * 0.65) + 16 * hem * 0.65;
    const kk = i * 4; ci.data[kk] = r; ci.data[kk + 1] = g; ci.data[kk + 2] = b; ci.data[kk + 3] = 255;
    H[i] = fold * 0.7 + n * 0.3 + weave;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const l = H[y * S + ((x + S - 1) % S)], r = H[y * S + ((x + 1) % S)], u = H[((y + S - 1) % S) * S + x], d = H[((y + 1) % S) * S + x];
    const nx = (l - r) * 4, ny = (u - d) * 4, len = Math.hypot(nx, ny, 1), k = (y * S + x) * 4;
    ni.data[k] = (nx / len * 0.5 + 0.5) * 255; ni.data[k + 1] = (-ny / len * 0.5 + 0.5) * 255; ni.data[k + 2] = (1 / len * 0.5 + 0.5) * 255; ni.data[k + 3] = 255;
  }
  col.getContext('2d').putImageData(ci, 0, 0); nrm.getContext('2d').putImageData(ni, 0, 0);
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  CLOTH = { map: T(col, true), normalMap: T(nrm) };
  return CLOTH;
}

// ткань колышется: смещение вершин в шейдере, сильнее к подолу
function clothMaterial(uni) {
  const c = clothTextures();
  const m = new THREE.MeshStandardMaterial({ ...c, roughness: 0.95, side: THREE.DoubleSide, normalScale: new THREE.Vector2(0.8, 0.8) });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uni.time; sh.uniforms.uWind = uni.wind;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hem = clamp(1.0 - position.y / 1.4, 0.0, 1.0);
      float w = sin(uTime * (2.0 + uWind * 6.0) + position.y * 5.0 + atan(position.x, position.z) * 3.0) * 0.5 + sin(uTime * 3.7 + position.y * 9.0) * 0.3;
      transformed.xz += normalize(position.xz + 0.0001) * w * hem * (0.015 + uWind * 0.05);
      transformed.z += hem * hem * uWind * 0.25;`);
  };
  return m;
}

// рваные края и дыры в ткани (альфа)
let RAG = null;
function ragAlpha() {
  if (RAG) return RAG;
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 512); g.fillStyle = '#000';
  let x = 0; while (x < 256) { const w = 6 + Math.random() * 22, h = 20 + Math.random() * 110; g.beginPath(); g.moveTo(x, 512); g.lineTo(x + w * (0.3 + Math.random() * 0.4), 512 - h); g.lineTo(x + w, 512); g.closePath(); g.fill(); x += w * (0.6 + Math.random() * 0.8); }
  for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(Math.random() * 256, 140 + Math.random() * 300, 3 + Math.random() * 9, 6 + Math.random() * 16, Math.random() * 3, 0, 7); g.fill(); }
  RAG = new THREE.CanvasTexture(c); return RAG;
}

// углубления глазниц, провал рта, скулы — геометрия под нарисованное лицо
function sculptFace(geo) {
  const p = geo.attributes.position, uv = geo.attributes.uv; const v3 = new THREE.Vector3();
  const bump = (u, v, cu, cv, rx, ry, amp, k = 2) => { const r2 = ((u - cu) / rx) ** 2 + ((v - cv) / ry) ** 2; return amp * Math.exp(-r2 * k); };
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    let d = 0;
    d -= bump(u, v, 0.385, 0.65, 0.085, 0.075, 0.018) + bump(u, v, 0.62, 0.635, 0.085, 0.075, 0.018);
    d -= bump(u, v, 0.5, 0.24, 0.12, 0.2, 0.032, 1.6);
    d -= bump(u, v, 0.5, 0.47, 0.05, 0.035, 0.008);
    d += bump(u, v, 0.27, 0.5, 0.08, 0.06, 0.006) + bump(u, v, 0.73, 0.5, 0.08, 0.06, 0.006);
    d += bump(u, v, 0.5, 0.76, 0.3, 0.035, 0.005);
    d -= bump(u, v, 0.22, 0.4, 0.07, 0.12, 0.008) + bump(u, v, 0.78, 0.4, 0.07, 0.12, 0.008); // впалые щёки
    v3.fromBufferAttribute(p, i); const n = v3.clone().normalize(); v3.addScaledVector(n, d); p.setXYZ(i, v3.x, v3.y, v3.z);
  }
  geo.computeVertexNormals(); return geo;
}

// палец из фаланг, слегка согнут
function finger(parent, mat, nail, lens, r, curl) {
  let node = parent;
  lens.forEach((L, k) => {
    const j = new THREE.Group(); j.rotation.x = curl; node.add(j);
    j.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 8, 6), mat));
    j.add(limb(r, r * 0.85, L, mat));
    const nx = new THREE.Group(); nx.position.y = -L - r; j.add(nx); node = nx;
    r *= 0.85;
  });
  const cl = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, 0.05, 6), nail); cl.position.y = -0.02; cl.rotation.x = Math.PI; node.add(cl);
}

export function makeMonster() {
  const sk = skinTextures();
  const skin = new THREE.MeshStandardMaterial({ ...sk, color: 0x6e655e, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1.5, 1.5) });
  const dark = new THREE.MeshStandardMaterial({ color: 0x050303, roughness: 1 });
  const nail = new THREE.MeshStandardMaterial({ color: 0x1e170f, roughness: 0.3 });
  const uni = { time: { value: 0 }, wind: { value: 0 } };
  const cloth = clothMaterial(uni);
  cloth.alphaMap = ragAlpha(); cloth.alphaTest = 0.5;
  const g = new THREE.Group(); const P = { arms: [], uni, skin };
  const spine = new THREE.Group(); g.add(spine); P.spine = spine;
  const R = noiseFn(4);
  const lathe = (prof, y0, y1, segs, rows, rag, extra = 0) => {
    const pts = []; for (let i = 0; i < rows; i++) { const t = y0 + i / (rows - 1) * (y1 - y0); let k = 0; while (k < prof.length - 2 && prof[k + 1][0] < t) k++; const [a0, r0] = prof[k], [a1, r1] = prof[k + 1]; const f = (t - a0) / (a1 - a0); pts.push(new THREE.Vector2(r0 + (r1 - r0) * f * f * (3 - 2 * f) + extra, t)); }
    const geo = new THREE.LatheGeometry(pts, segs); const bp = geo.attributes.position, buv = geo.attributes.uv;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i); const a = Math.atan2(x, z);
      // складки: крупные и мелкие
      const k = 1 + Math.sin(a * 9 + y * 2) * 0.05 * (1 - y / 1.9) + Math.sin(a * 23 + y * 5) * 0.015 + (R(a * 3 + 10, y * 3, 3) - 0.5) * 0.12;
      bp.setXYZ(i, x * k, y, z * k * 0.72); buv.setY(i, (y - y0) / (y1 - y0));
      if (rag) buv.setX(i, buv.getX(i) * 3);
    }
    geo.computeVertexNormals(); return geo;
  };
  const prof = [[0, 0.36], [0.25, 0.31], [0.7, 0.24], [1.1, 0.19], [1.4, 0.18], [1.62, 0.21], [1.7, 0.18], [1.76, 0.1], [1.79, 0.05]];
  const robe = new THREE.Mesh(lathe(prof, 0, 1.79, 64, 60, true), cloth); spine.add(robe);
  // накидка поверх плеч с рваным краем — второй слой ткани
  const capeMat = cloth.clone(); capeMat.onBeforeCompile = cloth.onBeforeCompile;
  const cape = new THREE.Mesh(lathe(prof, 0.95, 1.76, 56, 30, true, 0.035), capeMat); spine.add(cape);
  // костлявые ступни, видны, когда подол колышется
  for (const sx of [-1, 1]) {
    const foot = new THREE.Group(); foot.position.set(sx * 0.1, 0.02, -0.06); foot.rotation.y = sx * 0.15; spine.add(foot);
    const fm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.16), skin); fm.position.z = -0.06; foot.add(fm);
    for (let t = 0; t < 4; t++) { const toe = limb(0.008, 0.006, 0.06, skin); toe.rotation.x = -Math.PI / 2 + 0.2; toe.position.set((t - 1.5) * 0.015, 0, -0.14); foot.add(toe); }
  }
  // голова под капюшоном
  const head = new THREE.Group(); head.position.set(0, 1.83, -0.02); spine.add(head); P.head = head;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.088, 32, 24), dark); skull.scale.set(0.9, 1.3, 1); head.add(skull);
  const fg = sculptFace(new THREE.SphereGeometry(0.123, 64, 48, Math.PI * 1.5 - 1.05, 2.1, 0.35, 2.45));
  const face = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: faceTexture(), color: 0xa8a39c, roughness: 0.88, normalMap: sk.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) }));
  face.scale.set(0.9, 1.3, 1); head.add(face); P.face = face;
  // волосы: спутанные пряди из-под капюшона
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x060504, roughness: 0.95 });
  for (let i = 0; i < 44; i++) {
    const a = -1.2 + (i / 43) * 2.4; const len = 0.3 + Math.random() * 0.45;
    const strand = limb(0.0035 + Math.random() * 0.002, 0.001, len, hairMat);
    strand.position.set(Math.sin(a) * 0.12, 0.12, -Math.cos(a) * 0.08 + 0.02); strand.rotation.set(-0.15 + Math.random() * 0.2, 0, Math.sin(a) * 0.15);
    if (Math.abs(a) < 0.42) continue; // лицо открыто
    head.add(strand);
  }
  const hoodMat = cloth.clone(); hoodMat.alphaMap = null; hoodMat.alphaTest = 0; hoodMat.onBeforeCompile = cloth.onBeforeCompile;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.19, 40, 24, Math.PI * 1.5 + 0.62, Math.PI * 2 - 1.24, 0, Math.PI * 0.68), hoodMat);
  hood.scale.set(1, 1.3, 1.25); hood.position.set(0, 0.04, -0.01); head.add(hood);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff0d0, emissiveIntensity: 0 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), eyeMat); e.position.set(s * 0.031, 0.045, -0.1); head.add(e); }
  P.eyeMat = eyeMat;
  // руки: узловатые, длинные пальцы из фаланг
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.2, 1.6, 0.0); spine.add(sh);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.46, 20, 4, true), cloth); sleeve.position.y = -0.22; sh.add(sleeve);
    sh.add(limb(0.026, 0.02, 0.7, skin));
    const el = new THREE.Group(); el.position.y = -0.7; sh.add(el);
    el.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), skin));
    el.add(limb(0.021, 0.014, 0.66, skin));
    // вторая кость предплечья — сухожилие
    const tend = limb(0.008, 0.007, 0.6, skin); tend.position.set(0.012, -0.02, 0.008); el.add(tend);
    const hand = new THREE.Group(); hand.position.y = -0.67; el.add(hand);
    hand.add(new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), skin));
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.018), skin); palm.position.y = -0.04; hand.add(palm);
    for (let f = 0; f < 4; f++) {
      const base = new THREE.Group(); base.position.set((f - 1.5) * 0.014, -0.08, 0); base.rotation.z = (f - 1.5) * 0.05; hand.add(base);
      const long = f === 1 || f === 2 ? 0.02 : 0;
      finger(base, skin, nail, [0.09 + long, 0.075 + long, 0.06], 0.0072, 0.18);
    }
    const th = new THREE.Group(); th.position.set(-s * 0.03, -0.04, -0.005); th.rotation.set(0.3, 0, -s * 0.7); hand.add(th);
    finger(th, skin, nail, [0.06, 0.05], 0.008, 0.2);
    P.arms.push({ sh, el, hand, s });
  }
  g.traverse((o) => { if (o.isMesh) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); o.castShadow = o.geometry.boundingSphere.radius > 0.06; o.receiveShadow = true; } });
  g.userData.P = P; g.userData.walk = 0; g.userData.twitch = 0;
  return g;
}

// Ползун: истощённое тело на четвереньках, спина колесом, суставы вывернуты
export function makeCrawler() {
  const sk = skinTextures();
  const skin = new THREE.MeshStandardMaterial({ ...sk, color: 0x5e5650, roughness: 1, normalScale: new THREE.Vector2(1.6, 1.6) });
  const nail = new THREE.MeshStandardMaterial({ color: 0x1e170f, roughness: 0.3 });
  const g = new THREE.Group(); const P = { legs: [], arms: [] };
  const body = new THREE.Group(); body.position.y = 0.5; g.add(body); P.body = body;
  // торс: рёбра, позвонки, лопатки
  const R0 = [[0, 0.07], [0.08, 0.1], [0.2, 0.075], [0.3, 0.07], [0.42, 0.115], [0.52, 0.13], [0.6, 0.1], [0.66, 0.05]];
  const pts = []; for (let i = 0; i <= 34; i++) { const t = i / 34 * 0.66; let k = 0; while (k < R0.length - 2 && R0[k + 1][0] < t) k++; const [t0, r0] = R0[k], [t1, r1] = R0[k + 1]; const f = (t - t0) / (t1 - t0); pts.push(new THREE.Vector2(r0 + (r1 - r0) * f * f * (3 - 2 * f), t)); }
  const tg = new THREE.LatheGeometry(pts, 32); const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i); const a = Math.atan2(x, z); let k = 1;
    if (y > 0.3 && y < 0.6 && Math.abs(Math.abs(a) - Math.PI) > 0.5) k += Math.max(0, Math.sin(y * 55)) * 0.1;
    if (Math.abs(a) < 0.3) k += Math.max(0, Math.sin(y * 90)) * 0.16 * (1 - Math.abs(a) / 0.3);
    if (y > 0.45 && y < 0.6 && Math.abs(Math.abs(a) - 0.9) < 0.35) k += 0.08 * Math.sin((y - 0.45) / 0.15 * Math.PI); // лопатки
    tp.setX(i, x * k); tp.setZ(i, z * k * 0.8);
  }
  tg.computeVertexNormals();
  const torso = new THREE.Mesh(tg, skin); torso.rotation.x = -Math.PI / 2; body.add(torso); // вдоль -Z, спина вверх
  // голова
  const neck = new THREE.Group(); neck.position.set(0, 0.03, -0.64); body.add(neck); P.neck = neck;
  const nk = limb(0.035, 0.03, 0.12, skin); nk.rotation.x = -Math.PI / 2 - 0.5; neck.add(nk);
  const head = new THREE.Group(); head.position.set(0, 0.08, -0.12); neck.add(head); P.head = head;
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 28, 20), new THREE.MeshStandardMaterial({ color: 0x050303 })));
  const fg = sculptFace(new THREE.SphereGeometry(0.103, 48, 36, Math.PI * 1.5 - 1.05, 2.1, 0.35, 2.45));
  const face = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: faceTexture(), color: 0x9a948c, roughness: 0.88, normalMap: sk.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) })); face.scale.set(0.9, 1.25, 1); head.add(face);
  const skullBack = new THREE.Mesh(new THREE.SphereGeometry(0.1, 28, 20, Math.PI * 0.5 - 1.1, 2.2), skin); skullBack.scale.set(0.92, 1.25, 1.05); head.add(skullBack);
  head.rotation.x = 0.35; head.scale.setScalar(0.85);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffe8c0, emissiveIntensity: 2 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), eyeMat); e.position.set(s * 0.026, 0.035, -0.084); head.add(e); }
  // конечности: плечо—локоть—кисть, бедро—колено—стопа
  const chain = (parent, pos, lens, rs, mat) => {
    const root = new THREE.Group(); root.position.copy(pos); parent.add(root); const joints = [root]; let node = root;
    lens.forEach((L, i) => { node.add(new THREE.Mesh(new THREE.SphereGeometry(rs[i] * 1.0, 10, 8), mat)); node.add(limb(rs[i], rs[i] * 0.7, L, mat, 0.22)); const n = new THREE.Group(); n.position.y = -L - rs[i]; node.add(n); joints.push(n); node = n; });
    return joints;
  };
  for (const s of [-1, 1]) {
    const a = chain(body, new THREE.Vector3(s * 0.13, -0.02, -0.56), [0.27, 0.28], [0.03, 0.023], skin);
    const hand = a[2]; hand.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.06), skin));
    for (let f = 0; f < 4; f++) { const b = new THREE.Group(); b.position.set((f - 1.5) * 0.014, -0.005, -0.03); b.rotation.set(-1.25, (f - 1.5) * 0.25, 0); hand.add(b); finger(b, skin, nail, [0.06, 0.05], 0.006, 0.25); }
    P.arms.push({ sh: a[0], el: a[1], wr: a[2], s });
    const l = chain(body, new THREE.Vector3(s * 0.1, -0.02, 0.03), [0.36, 0.36], [0.038, 0.026], skin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.15), skin); foot.position.z = -0.05; l[2].add(foot);
    P.legs.push({ hip: l[0], knee: l[1], s });
  }
  g.traverse((o) => { if (o.isMesh) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); o.castShadow = o.geometry.boundingSphere.radius > 0.1; } });
  g.userData.P = P; g.userData.t = Math.random() * 10;
  poseCrawler(g, false, 0);
  return g;
}

export function poseCrawler(c, moving, dt, speed = 1) {
  const P = c.userData.P; c.userData.t += dt * (moving ? 12 * speed : 1.2);
  const t = c.userData.t;
  // руки прямые, локти вывернуты назад; колени на земле, голени волочатся
  P.arms.forEach((a, i) => {
    const ph = t + (i ? Math.PI : 0); const sw = moving ? Math.sin(ph) : 0, lift = moving ? Math.max(0, Math.cos(ph)) : 0;
    a.sh.rotation.set(0.25 + sw * 0.45, 0, a.s * 0.22); a.el.rotation.set(-0.45 - lift * 0.3, 0, -a.s * 0.05);
    a.wr.rotation.set(0.5, 0, 0);
  });
  P.legs.forEach((l, i) => {
    const ph = t + (i ? 0 : Math.PI); const sw = moving ? Math.sin(ph) : 0;
    l.hip.rotation.set(-0.15 + sw * 0.25, 0, l.s * 0.25); l.knee.rotation.set(-1.4 - sw * 0.15, 0, 0);
  });
  P.body.position.y = 0.47 + Math.abs(Math.sin(t)) * (moving ? 0.03 : 0.006); P.body.rotation.x = -0.12;
  P.body.rotation.z = moving ? Math.sin(t) * 0.06 : 0;
  P.head.rotation.z = Math.sin(t * 0.6) * 0.35 + (Math.random() < 0.04 ? (Math.random() - 0.5) * 1.2 : 0);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Позы. Модель смотрит в -Z. У плеча rotation.x > 0 — рука вперёд; у spine < 0 — наклон вперёд.
export function poseMonster(m, state, dt, t, opts = {}) {
  const P = m.userData.P; const U = m.userData;
  P.uni.time.value = t;
  if (state === 'frozen') { P.uni.wind.value *= 0.9; return; } // застыл, только ткань успокаивается
  const ease = (o, k, v) => { o[k] += (v - o[k]) * clamp(dt * 10, 0, 1); };
  if (state === 'idle' || state === 'stalk') {
    U.walk += dt * (state === 'stalk' ? 2.2 : 0);
    ease(P.spine.rotation, 'x', -0.08); P.spine.position.y = Math.abs(Math.sin(U.walk)) * 0.025;
    P.uni.wind.value += ((state === 'stalk' ? 0.25 : 0.05) - P.uni.wind.value) * clamp(dt * 3, 0, 1);
    P.arms.forEach((a, i) => { ease(a.sh.rotation, 'x', 0.08 + Math.sin(U.walk + i * 3) * 0.06); ease(a.sh.rotation, 'z', a.s * -0.04); ease(a.el.rotation, 'x', 0.1); });
    U.twitch -= dt; if (U.twitch <= 0) { U.twitch = 0.8 + Math.random() * 2.5; U.hy = (Math.random() - 0.5) * 1.0; U.hz = (Math.random() - 0.5) * 1.2; }
    ease(P.head.rotation, 'y', U.hy || 0); ease(P.head.rotation, 'z', U.hz || 0); ease(P.head.rotation, 'x', -0.15);
  } else if (state === 'chase') {
    U.walk += dt * 12;
    const s = Math.sin(U.walk);
    ease(P.spine.rotation, 'x', -0.32); P.spine.position.y = Math.abs(s) * 0.05;
    P.uni.wind.value += (1 - P.uni.wind.value) * clamp(dt * 4, 0, 1);
    P.arms.forEach((a, i) => { a.sh.rotation.x = 1.25 + Math.sin(U.walk + i * Math.PI) * 0.35; a.sh.rotation.z = a.s * -0.25; a.el.rotation.x = 0.35 + Math.max(0, Math.sin(U.walk * 0.5 + i)) * 0.4; });
    U.twitch -= dt; if (U.twitch <= 0) { U.twitch = 0.03 + Math.random() * 0.12; P.head.rotation.set(0.2 + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.4); }
  } else if (state === 'scream') {
    P.spine.rotation.x = -0.1; P.spine.position.y = 0;
    P.uni.wind.value = 1.2;
    P.head.rotation.set(0.12 + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, Math.sin(t * 70) * 0.2);
    P.arms.forEach((a) => { a.sh.rotation.x = 1.45; a.sh.rotation.z = a.s * -0.5; a.el.rotation.x = 0.7; });
  } else if (state === 'stand') {
    P.spine.rotation.x = -0.03; P.spine.position.y = 0; P.uni.wind.value = 0.05;
    P.arms.forEach((a) => { a.sh.rotation.x = 0.02; a.sh.rotation.z = a.s * -0.03; a.el.rotation.x = 0; });
    P.head.rotation.set(-0.12, 0, opts.tilt ?? 0.55);
  }
}
