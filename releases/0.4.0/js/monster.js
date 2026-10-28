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

function limb(r0, r1, len, mat) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 10, 6); g.translate(0, -len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + Math.sin(y * 23) * 0.06 + Math.sin(y * 7.1 + 1) * 0.05; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
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

export function makeMonster() {
  const sk = skinTextures();
  const skin = new THREE.MeshStandardMaterial({ ...sk, color: 0x6e655e, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1.5, 1.5) });
  const dark = new THREE.MeshStandardMaterial({ color: 0x050303, roughness: 1 });
  const nail = new THREE.MeshStandardMaterial({ color: 0x1e170f, roughness: 0.35 });
  const uni = { time: { value: 0 }, wind: { value: 0 } };
  const cloth = clothMaterial(uni);
  const g = new THREE.Group(); const P = { arms: [], uni };
  const spine = new THREE.Group(); g.add(spine); P.spine = spine; // наклон всего тела от пола
  // балахон
  const prof = [[0, 0.36], [0.25, 0.31], [0.7, 0.24], [1.1, 0.19], [1.4, 0.18], [1.62, 0.21], [1.7, 0.18], [1.76, 0.1], [1.79, 0.05]];
  const pts = []; for (let i = 0; i < 40; i++) { const t = i / 39 * 1.79; let k = 0; while (k < prof.length - 2 && prof[k + 1][0] < t) k++; const [y0, r0] = prof[k], [y1, r1] = prof[k + 1]; const f = (t - y0) / (y1 - y0); pts.push(new THREE.Vector2(r0 + (r1 - r0) * f * f * (3 - 2 * f), t)); }
  const bg = new THREE.LatheGeometry(pts, 40);
  const bp = bg.attributes.position, buv = bg.attributes.uv;
  const R = noiseFn(4);
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i); const a = Math.atan2(x, z);
    let k = 1 + Math.sin(a * 9 + y * 2) * 0.05 * (1 - y / 1.8) + (R(a * 3 + 10, y * 3, 3) - 0.5) * 0.12;
    let ny = y;
    if (y < 0.06) ny = 0.02 + Math.max(0, R(a * 6 + 3, 1, 2) - 0.35) * 0.45; // рваный подол
    bp.setXYZ(i, x * k, ny, z * k * 0.72);
    buv.setY(i, y / 1.8);
  }
  bg.computeVertexNormals();
  const robe = new THREE.Mesh(bg, cloth); spine.add(robe);
  // голова под капюшоном
  const head = new THREE.Group(); head.position.set(0, 1.83, -0.02); spine.add(head); P.head = head;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 18), dark); skull.scale.set(0.9, 1.3, 1); head.add(skull);
  const fg = new THREE.SphereGeometry(0.123, 32, 24, Math.PI * 1.5 - 1.05, 2.1, 0.35, 2.45);
  const face = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.55, normalMap: sk.normalMap }));
  face.scale.set(0.9, 1.3, 1); head.add(face); P.face = face;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.19, 28, 18, Math.PI * 1.5 + 0.62, Math.PI * 2 - 1.24, 0, Math.PI * 0.68), cloth);
  hood.scale.set(1, 1.3, 1.25); hood.position.set(0, 0.04, -0.01); head.add(hood);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff0d0, emissiveIntensity: 0 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), eyeMat); e.position.set(s * 0.033, 0.045, -0.112); head.add(e); }
  P.eyeMat = eyeMat;
  // руки из рукавов
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.2, 1.6, 0.0); spine.add(sh);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 0.42, 14, 3, true), cloth); sleeve.position.y = -0.2; sh.add(sleeve);
    sh.add(limb(0.026, 0.02, 0.7, skin));
    const el = new THREE.Group(); el.position.y = -0.7; sh.add(el);
    el.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), skin));
    el.add(limb(0.021, 0.015, 0.66, skin));
    const hand = new THREE.Group(); hand.position.y = -0.67; el.add(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.018), skin); palm.position.y = -0.03; hand.add(palm);
    for (let f = 0; f < 4; f++) {
      const fgp = new THREE.Group(); fgp.position.set((f - 1.5) * 0.014, -0.07, 0); fgp.rotation.set(0.15 + f * 0.06, 0, (f - 1.5) * 0.06); hand.add(fgp);
      fgp.add(limb(0.007, 0.004, 0.2 + (f === 1 || f === 2 ? 0.06 : 0), skin));
      const cl = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.05, 5), nail); cl.position.y = -0.27; cl.rotation.x = Math.PI; fgp.add(cl);
    }
    P.arms.push({ sh, el, hand, s });
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.P = P; g.userData.walk = 0; g.userData.twitch = 0;
  return g;
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
