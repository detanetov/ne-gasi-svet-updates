// Генерация подземелья, процедурные текстуры и сборка сцены
import * as THREE from 'three';

export const TILE = 2.4;
export const WALL_H = 3.3;

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- Лабиринт ----------------
export function generateMaze(seed, cells = 12) {
  const R = rng(seed);
  const G = cells * 2 + 1;
  const grid = new Uint8Array(G * G).fill(1);
  const idx = (x, y) => y * G + x;
  const seen = new Uint8Array(cells * cells);
  const stack = [[0, 0]];
  seen[0] = 1; grid[idx(1, 1)] = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = dirs.filter(([dx, dy]) => {
      const nx = cx + dx, ny = cy + dy;
      return nx >= 0 && ny >= 0 && nx < cells && ny < cells && !seen[ny * cells + nx];
    });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy] = opts[Math.floor(R() * opts.length)];
    const nx = cx + dx, ny = cy + dy;
    seen[ny * cells + nx] = 1;
    grid[idx(cx * 2 + 1 + dx, cy * 2 + 1 + dy)] = 0;
    grid[idx(nx * 2 + 1, ny * 2 + 1)] = 0;
    stack.push([nx, ny]);
  }
  // Петли: убираем часть стен, чтобы можно было убегать кругами
  for (let i = 0; i < cells * cells * 0.16; i++) {
    const x = 1 + Math.floor(R() * (G - 2)), y = 1 + Math.floor(R() * (G - 2));
    if (grid[idx(x, y)] !== 1) continue;
    const h = grid[idx(x - 1, y)] === 0 && grid[idx(x + 1, y)] === 0 && grid[idx(x, y - 1)] === 1 && grid[idx(x, y + 1)] === 1;
    const v = grid[idx(x, y - 1)] === 0 && grid[idx(x, y + 1)] === 0 && grid[idx(x - 1, y)] === 1 && grid[idx(x + 1, y)] === 1;
    if (h || v) grid[idx(x, y)] = 0;
  }
  // Залы
  const rooms = [];
  for (let i = 0; i < 4; i++) {
    const w = 3 + Math.floor(R() * 2) * 2, hgt = 3 + Math.floor(R() * 2) * 2;
    const x0 = 1 + Math.floor(R() * (G - w - 2)), y0 = 1 + Math.floor(R() * (G - hgt - 2));
    for (let y = y0; y < y0 + hgt; y++) for (let x = x0; x < x0 + w; x++) grid[idx(x, y)] = 0;
    rooms.push({ x0, y0, w, h: hgt });
  }
  // Стартовая комната
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) grid[idx(x, y)] = 0;

  const isWall = (x, y) => x < 0 || y < 0 || x >= G || y >= G || grid[idx(x, y)] === 1;
  // BFS от старта
  const dist = bfs(grid, G, 2, 2);
  let far = [2, 2], fd = 0;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const d = dist[idx(x, y)];
    if (d > fd && d < 1e9) { fd = d; far = [x, y]; }
  }
  // Тупики
  const deadEnds = [], open = [];
  for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) {
    if (isWall(x, y) || dist[idx(x, y)] >= 1e9) continue;
    const n = (isWall(x - 1, y) ? 1 : 0) + (isWall(x + 1, y) ? 1 : 0) + (isWall(x, y - 1) ? 1 : 0) + (isWall(x, y + 1) ? 1 : 0);
    if (n === 3) deadEnds.push([x, y]);
    open.push([x, y]);
  }
  const pick = (list, count, minD, avoid) => {
    const out = [];
    const sh = list.slice().sort(() => R() - 0.5);
    for (const p of sh) {
      if (out.length >= count) break;
      if (dist[idx(p[0], p[1])] < 6) continue;
      if (avoid.concat(out).some((q) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) < minD)) continue;
      out.push(p);
    }
    return out;
  };
  let fuses = pick(deadEnds, 5, 9, [far]);
  if (fuses.length < 5) fuses = fuses.concat(pick(open, 5 - fuses.length, 7, [far, ...fuses]));
  const batteries = pick(deadEnds.concat(open), 9, 5, [far, ...fuses]);
  const notes = pick(deadEnds.concat(open), 9, 5, [far, [2, 2], ...fuses, ...batteries]);
  const props = pick(open, 44, 2, [far, ...fuses, ...batteries, ...notes, [2, 2]]);
  return { G, grid, isWall, dist, start: [2, 2], exit: far, fuses, batteries, notes, props, rooms, R };
}

export function bfs(grid, G, sx, sy) {
  const dist = new Float32Array(G * G).fill(1e9);
  const q = new Int32Array(G * G);
  let h = 0, t = 0;
  dist[sy * G + sx] = 0; q[t++] = sy * G + sx;
  while (h < t) {
    const c = q[h++]; const x = c % G, y = (c / G) | 0;
    const d = dist[c] + 1;
    const nb = [c - 1, c + 1, c - G, c + G];
    const ok = [x > 0, x < G - 1, y > 0, y < G - 1];
    for (let i = 0; i < 4; i++) {
      if (!ok[i]) continue; const n = nb[i];
      if (grid[n] === 0 && dist[n] > d) { dist[n] = d; q[t++] = n; }
    }
  }
  return dist;
}

export const tileCenter = (x, y) => new THREE.Vector3(x * TILE + TILE / 2, 0, y * TILE + TILE / 2);
export const toTile = (v) => [Math.floor(v.x / TILE), Math.floor(v.z / TILE)];

// ---------------- Процедурные текстуры ----------------
function noise2(seed) {
  const R = rng(seed); const P = new Float32Array(256 * 256);
  for (let i = 0; i < P.length; i++) P[i] = R();
  const at = (x, y) => P[((y & 255) << 8) | (x & 255)];
  const sm = (t) => t * t * (3 - 2 * t);
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * a; a *= 0.5; f *= 2; } return s; };
}

function makeMaps(size, fn, seed) {
  // fn(u,v) -> {h, r, g, b, rough}
  const H = new Float32Array(size * size);
  const col = document.createElement('canvas'); col.width = col.height = size;
  const rgh = document.createElement('canvas'); rgh.width = rgh.height = size;
  const nrm = document.createElement('canvas'); nrm.width = nrm.height = size;
  const cc = col.getContext('2d'), rc = rgh.getContext('2d'), nc = nrm.getContext('2d');
  const ci = cc.createImageData(size, size), ri = rc.createImageData(size, size), ni = nc.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = fn(x / size, y / size, x, y);
    const i = y * size + x; H[i] = o.h;
    ci.data[i * 4] = o.r; ci.data[i * 4 + 1] = o.g; ci.data[i * 4 + 2] = o.b; ci.data[i * 4 + 3] = 255;
    const rv = Math.max(0, Math.min(255, o.rough * 255));
    ri.data[i * 4] = rv; ri.data[i * 4 + 1] = rv; ri.data[i * 4 + 2] = rv; ri.data[i * 4 + 3] = 255;
  }
  const S = 5.0 * size / 512;
  const aoc = document.createElement('canvas'); aoc.width = aoc.height = size; const ac = aoc.getContext('2d'); const ai = ac.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const v = Math.max(0, Math.min(255, (0.35 + H[i] * 1.1) * 255)); ai.data[i * 4] = ai.data[i * 4 + 1] = ai.data[i * 4 + 2] = v; ai.data[i * 4 + 3] = 255; }
  ac.putImageData(ai, 0, 0);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hl = H[y * size + ((x - 1 + size) % size)], hr = H[y * size + ((x + 1) % size)];
    const hu = H[((y - 1 + size) % size) * size + x], hd = H[((y + 1) % size) * size + x];
    let nx = (hl - hr) * S, ny = (hu - hd) * S, nz = 1; const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l; const i = (y * size + x) * 4;
    ni.data[i] = (nx * 0.5 + 0.5) * 255; ni.data[i + 1] = (-ny * 0.5 + 0.5) * 255; ni.data[i + 2] = (nz * 0.5 + 0.5) * 255; ni.data[i + 3] = 255;
  }
  cc.putImageData(ci, 0, 0); rc.putImageData(ri, 0, 0); nc.putImageData(ni, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: tex(col, true), roughnessMap: tex(rgh), normalMap: tex(nrm), aoMap: tex(aoc) };
}

function brickTexture(size) {
  const N = noise2(11), N2 = noise2(23);
  const rows = 8, cols = 4;
  return makeMaps(size, (u, v) => {
    const ry = v * rows; const row = Math.floor(ry); const off = (row % 2) * 0.5;
    const rx = u * cols + off; const colI = Math.floor(rx);
    const fx = rx - colI, fy = ry - row;
    const wob = 0.7 + N(u * 40, v * 40, 2) * 0.6;
    const mortar = Math.min(Math.min(fx, 1 - fx) / (0.035 * wob), Math.min(fy, 1 - fy) / (0.07 * wob));
    const bseed = (row * 31 + ((colI % cols) + cols) % cols * 17) % 97;
    const bv = Math.abs((Math.sin(bseed * 12.9898) * 43758.5453) % 1);
    const n = N(u * 18, v * 18, 5);
    const chip = N2(u * 30 + bseed, v * 30, 3);
    const chipped = mortar >= 1 && mortar < 2.2 && chip > 0.62;
    const stain = Math.max(0, N2(u * 3, v * 1.2, 3) - 0.45) * 1.6 + v * 0.25;
    let h, r, g, b, rough;
    if (mortar < 1) {
      h = 0.15 * mortar + n * 0.08;
      const k = 55 + n * 30; r = k * 0.9; g = k * 0.88; b = k * 0.82; rough = 0.95;
    } else {
      const bump = Math.min(1, (mortar - 1) * 0.6);
      h = 0.4 + bump * 0.25 + n * 0.35;
      const base = 70 + bv * 60 + (n - 0.5) * 80;
      const hue = bv > 0.7 ? [0.95, 0.9, 0.85] : bv < 0.25 ? [1.05, 0.8, 0.65] : [1.0, 0.86, 0.74];
      r = base * hue[0]; g = base * hue[1]; b = base * hue[2]; rough = 0.8 - n * 0.25;
      if (chipped) { h -= 0.3; r *= 0.7; g *= 0.7; b *= 0.7; }
      const moss = N2(u * 6 + 3, v * 6, 4); if (moss > 0.66 && v > 0.55) { const k = (moss - 0.66) * 3; r = r * (1 - k) + 40 * k; g = g * (1 - k) + 55 * k; b = b * (1 - k) + 30 * k; }
    }
    const dk = 1 - Math.min(0.75, stain);
    r *= dk; g *= dk * 1.02; b *= dk * 0.98;
    if (stain > 0.5) rough -= 0.25; // мокрые подтёки
    return { h, r, g, b, rough };
  }, 1);
}

function floorTexture(size) {
  const N = noise2(5), N2 = noise2(77);
  return makeMaps(size, (u, v) => {
    const s = 2; const fx = (u * s) % 1, fy = (v * s) % 1;
    const tx = Math.floor(u * s), ty = Math.floor(v * s);
    const gap = Math.min(fx, 1 - fx, fy, 1 - fy);
    const n = N(u * 24, v * 24, 5);
    const crack = Math.abs(N2(u * 9 + tx, v * 9 + ty, 4) - 0.5) < 0.012 ? 1 : 0;
    const puddle = N2(u * 2.2, v * 2.2, 3);
    let h = gap < 0.02 ? 0.05 : 0.5 + n * 0.3 - crack * 0.3;
    const tint = ((tx * 7 + ty * 13) % 5) * 6;
    let k = 70 + n * 50 + tint - crack * 30; if (gap < 0.02) k = 30;
    let rough = 0.85 - n * 0.2;
    if (puddle > 0.6) { rough = 0.08; k *= 0.55; h = 0.45; }
    return { h, r: k * 0.92, g: k * 0.9, b: k * 0.88, rough };
  }, 2);
}

function ceilTexture(size) {
  const N = noise2(9);
  return makeMaps(size, (u, v) => {
    const n = N(u * 12, v * 12, 6); const k = 35 + n * 45;
    return { h: n, r: k, g: k * 0.95, b: k * 0.9, rough: 0.95 };
  }, 3);
}

function woodTexture(size) {
  const N = noise2(41);
  return makeMaps(size, (u, v) => {
    const plank = Math.floor(v * 5); const fy = (v * 5) % 1;
    const n = N(u * 3, v * 40 + plank * 7, 4);
    const grain = Math.sin((u * 60 + n * 8 + plank * 3)) * 0.5 + 0.5;
    const gap = fy < 0.04 || fy > 0.96;
    const k = gap ? 18 : 60 + grain * 30 + n * 30;
    return { h: gap ? 0 : 0.5 + grain * 0.2, r: k * 1.0, g: k * 0.72, b: k * 0.45, rough: 0.8 };
  }, 4);
}

export function flashlightCookie() {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, '#fffaf0'); grd.addColorStop(0.18, '#fff4dd'); grd.addColorStop(0.22, '#c9bda5');
  grd.addColorStop(0.5, '#8a8072'); grd.addColorStop(0.62, '#a39684'); grd.addColorStop(0.7, '#5a524a');
  grd.addColorStop(0.95, '#151311'); grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  // пыль и царапины на линзе
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`;
    g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 10, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function sackTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5a4b38'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { const v = Math.random(); g.fillStyle = `rgba(${v > 0.5 ? 120 : 30},${v > 0.5 ? 100 : 22},${v > 0.5 ? 70 : 14},.25)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 1 + Math.random() * 3); }
    g.filter = 'blur(8px)'; for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(50,8,4,.55)'; g.beginPath(); g.ellipse(Math.random() * w, h * 0.5 + Math.random() * h * 0.5, 15 + Math.random() * 30, 20 + Math.random() * 50, 0, 0, 7); g.fill(); }
  });
}
function trailTexture() {
  return canvasTex(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.filter = 'blur(3px)';
    for (let i = 0; i < 5; i++) { g.strokeStyle = `rgba(${45 + Math.random() * 20},4,2,${0.35 + Math.random() * 0.3})`; g.lineWidth = 6 + Math.random() * 16; g.beginPath(); let x = 40 + Math.random() * 48; g.moveTo(x, 0); for (let y = 0; y < h; y += 32) { x += (Math.random() - 0.5) * 10; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(40,3,2,.7)'; g.beginPath(); g.ellipse(64, h - 60, 45, 55, 0, 0, 7); g.fill();
  });
}
function webTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(220,215,200,.5)'; g.lineWidth = 1;
    const cx = 0, cy = 0;
    for (let i = 0; i < 9; i++) { const a = i / 8 * Math.PI / 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(Math.cos(a) * 300, Math.sin(a) * 300); g.stroke(); }
    for (let r = 20; r < 260; r += 16 + Math.random() * 10) { g.beginPath(); for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; const rr = r * (0.92 + Math.random() * 0.1); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? g.quadraticCurveTo(Math.cos(a - 0.1) * rr * 0.9, Math.sin(a - 0.1) * rr * 0.9, x, y) : g.moveTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(200,195,180,.15)'; g.filter = 'blur(6px)'; g.fillRect(0, 0, 90, 90);
  });
}
function scratchTexture(R) {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let set = 0; set < 3; set++) {
      const ox = 30 + R() * 160, oy = 20 + R() * 80, ang = (R() - 0.5) * 0.5;
      for (let f = 0; f < 4; f++) {
        g.save(); g.translate(ox + f * 14, oy); g.rotate(ang);
        g.strokeStyle = 'rgba(15,10,8,.85)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(4, 50, -3, 100, 2, 130 + R() * 40); g.stroke();
        g.strokeStyle = 'rgba(190,170,140,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(1.5, 0); g.bezierCurveTo(5.5, 50, -1.5, 100, 3.5, 128); g.stroke();
        if (R() < 0.5) { g.fillStyle = 'rgba(60,6,4,.6)'; g.fillRect(-1, 120, 3, 20 + R() * 40); }
        g.restore();
      }
    }
  });
}

// ---------------- Сборка сцены ----------------
export function buildWorld(scene, maze, quality) {
  const { G, isWall } = maze;
  const R = rng(maze.seedProps || 1234);
  const texSize = quality === 'low' ? 256 : quality === 'ultra' ? 1024 : quality === 'high' ? 768 : 512;
  const brick = brickTexture(texSize), floor = floorTexture(texSize), ceil = ceilTexture(256), wood = woodTexture(256);

  const wallMat = new THREE.MeshStandardMaterial({ ...brick, color: 0xffffff, roughness: 1, aoMapIntensity: 1, normalScale: new THREE.Vector2(1.4, 1.4) });
  brick.map.repeat.set(1, 1);
  const boxGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
  // растянуть UV по высоте, чтобы кирпичи не вытягивались
  const uv = boxGeo.attributes.uv, nrmA = boxGeo.attributes.normal;
  for (let i = 0; i < uv.count; i++) if (Math.abs(nrmA.getY(i)) < 0.5) uv.setY(i, uv.getY(i) * WALL_H / TILE);
  const walls = [];
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    if (!isWall(x, y)) continue;
    if (isWall(x - 1, y) && isWall(x + 1, y) && isWall(x, y - 1) && isWall(x, y + 1)) continue;
    walls.push([x, y]);
  }
  const inst = new THREE.InstancedMesh(boxGeo, wallMat, walls.length);
  const m4 = new THREE.Matrix4();
  walls.forEach(([x, y], i) => { m4.makeTranslation(x * TILE + TILE / 2, WALL_H / 2, y * TILE + TILE / 2); inst.setMatrixAt(i, m4); });
  inst.castShadow = true; inst.receiveShadow = true;
  scene.add(inst);

  const size = G * TILE;
  const fGeo = new THREE.PlaneGeometry(size, size); fGeo.rotateX(-Math.PI / 2);
  for (const k of ['map', 'roughnessMap', 'normalMap', 'aoMap']) floor[k].repeat.set(G / 1.5, G / 1.5);
  const floorMesh = new THREE.Mesh(fGeo, new THREE.MeshStandardMaterial({ ...floor, roughness: 1, metalness: 0.0, normalScale: new THREE.Vector2(1.2, 1.2) }));
  floorMesh.position.set(size / 2, 0, size / 2); floorMesh.receiveShadow = true; scene.add(floorMesh);

  const cGeo = new THREE.PlaneGeometry(size, size); cGeo.rotateX(Math.PI / 2);
  for (const k of ['map', 'roughnessMap', 'normalMap', 'aoMap']) ceil[k].repeat.set(G / 2, G / 2);
  const ceilMesh = new THREE.Mesh(cGeo, new THREE.MeshStandardMaterial({ ...ceil, roughness: 1 }));
  ceilMesh.position.set(size / 2, WALL_H, size / 2); ceilMesh.receiveShadow = true; scene.add(ceilMesh);

  // Деревянные балки под потолком
  const beamMat = new THREE.MeshStandardMaterial({ ...wood, roughness: 0.9 });
  const beamGeo = new THREE.BoxGeometry(TILE, 0.25, 0.3);
  const beams = [];
  for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) {
    if (isWall(x, y)) continue;
    if (isWall(x, y - 1) && isWall(x, y + 1) && (x + y) % 2 === 0) beams.push([x, y, 0]);
    else if (isWall(x - 1, y) && isWall(x + 1, y) && (x + y) % 2 === 0) beams.push([x, y, 1]);
  }
  const beamInst = new THREE.InstancedMesh(beamGeo, beamMat, beams.length);
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  beams.forEach(([x, y, r], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r ? 0 : Math.PI / 2);
    m4.compose(new THREE.Vector3(x * TILE + TILE / 2, WALL_H - 0.13, y * TILE + TILE / 2), q, sc);
    beamInst.setMatrixAt(i, m4);
  });
  beamInst.castShadow = true; beamInst.receiveShadow = true; scene.add(beamInst);

  // Стойки крепи под балками
  const postGeo = new THREE.BoxGeometry(0.22, WALL_H - 0.25, 0.22);
  const postInst = new THREE.InstancedMesh(postGeo, beamMat, beams.length * 2);
  beams.forEach(([x, y, r], i) => {
    for (const s of [-1, 1]) {
      const px = x * TILE + TILE / 2 + (r ? s * (TILE / 2 - 0.12) : 0), pz = y * TILE + TILE / 2 + (r ? 0 : s * (TILE / 2 - 0.12));
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (R() - 0.5) * 0.05);
      m4.compose(new THREE.Vector3(px, (WALL_H - 0.25) / 2, pz), q, sc); postInst.setMatrixAt(i * 2 + (s + 1) / 2, m4);
    }
  });
  postInst.castShadow = true; postInst.receiveShadow = true; scene.add(postInst);

  const crateMat = new THREE.MeshStandardMaterial({ ...wood, roughness: 0.85 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.45, metalness: 0.85 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x4a2c1e, roughness: 0.8, metalness: 0.5 });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xb3a68a, roughness: 0.7 });
  const sackMat = new THREE.MeshStandardMaterial({ map: sackTexture(), roughness: 1 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x4a3c2a, roughness: 1 });
  const colliders = [], candles = [], lamps = [], hangers = [], drips = [];
  const wallSide = (x, y) => {
    const s = [];
    if (isWall(x - 1, y)) s.push([-1, 0]); if (isWall(x + 1, y)) s.push([1, 0]);
    if (isWall(x, y - 1)) s.push([0, -1]); if (isWall(x, y + 1)) s.push([0, 1]);
    return s;
  };
  // Трубы вдоль стен под потолком: длинные прямые участки
  const pipeGeo = new THREE.CylinderGeometry(0.07, 0.07, TILE, 12); pipeGeo.rotateZ(Math.PI / 2);
  const pipeList = [];
  for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) {
    if (isWall(x, y)) continue;
    if (isWall(x, y - 1) && !isWall(x - 1, y) && !isWall(x + 1, y) && (y % 4 === 1)) pipeList.push([x, y, 0, -1]);
    if (isWall(x - 1, y) && !isWall(x, y - 1) && !isWall(x, y + 1) && (x % 4 === 3)) pipeList.push([x, y, 1, -1]);
  }
  const pipeInst = new THREE.InstancedMesh(pipeGeo, rustMat, pipeList.length * 2);
  pipeList.forEach(([x, y, vert, s], i) => {
    const c = tileCenter(x, y);
    for (let k = 0; k < 2; k++) {
      const off = TILE / 2 - 0.12 - k * 0.17, h = WALL_H - 0.45 - k * 0.05;
      if (!vert) { q.identity(); m4.compose(new THREE.Vector3(c.x, h, c.z + s * off), q, sc); }
      else { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); m4.compose(new THREE.Vector3(c.x + s * off, h, c.z), q, sc); }
      pipeInst.setMatrixAt(i * 2 + k, m4);
    }
    if (R() < 0.12) drips.push(new THREE.Vector3(vert ? c.x - off2() : c.x, WALL_H - 0.5, vert ? c.z : c.z - off2()));
  });
  function off2() { return TILE / 2 - 0.12; }
  pipeInst.castShadow = true; pipeInst.receiveShadow = true; scene.add(pipeInst);

  // Пятна на полу: волок, лужи крови
  const trailTex = trailTexture();
  // Паутина в углах
  const webTex = webTexture();
  const webMat = new THREE.MeshStandardMaterial({ map: webTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, alphaTest: 0.02 });

  maze.props.forEach(([x, y], k) => {
    const sides = wallSide(x, y); if (!sides.length) return;
    const [sx, sy] = sides[Math.floor(R() * sides.length)];
    const c = tileCenter(x, y);
    const wx = c.x + sx * (TILE / 2 - 0.45), wz = c.z + sy * (TILE / 2 - 0.45);
    const kind = k % 8;
    if (kind === 0) {
      const s = 0.65 + R() * 0.25;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
      crate.position.set(wx, s / 2, wz); crate.rotation.y = R() * 0.6 - 0.3; crate.castShadow = crate.receiveShadow = true; scene.add(crate);
      if (R() > 0.5) { const c2 = crate.clone(); c2.scale.setScalar(0.65); c2.position.y = s + s * 0.65 / 2; c2.rotation.y += R(); scene.add(c2); }
      colliders.push({ x: wx, z: wz, r: s * 0.7 });
    } else if (kind === 1 || kind === 5) {
      // висящее тело в мешке
      const g = new THREE.Group(); const len = 1.5 + R() * 0.3;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, len - 0.4, 6, 14), sackMat); body.position.y = -0.55 - len / 2;
      const bp = body.geometry.attributes.position; for (let i = 0; i < bp.count; i++) { const yy = bp.getY(i); const kk = 1 + Math.sin(yy * 6 + i) * 0.04 - (yy > len * 0.3 ? 0.25 : 0); bp.setX(i, bp.getX(i) * kk); bp.setZ(i, bp.getZ(i) * kk * 0.8); } body.geometry.computeVertexNormals();
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), ropeMat); tie.rotation.x = Math.PI / 2; tie.position.y = -0.62; g.add(tie);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6), ropeMat); rope.position.y = -0.3; g.add(rope, body);
      const cx = c.x + (R() - 0.5) * 0.5, cz = c.z + (R() - 0.5) * 0.5;
      g.position.set(cx, WALL_H, cz); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(g);
      hangers.push({ group: g, pos: new THREE.Vector3(cx, 0, cz), t: R() * 100, trigger: kind === 5, dropped: false, len, vy: 0, body });
      colliders.push({ x: cx, z: cz, r: 0.28, hanger: true });
    } else if (kind === 2) {
      // кости и череп
      const g = new THREE.Group();
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), boneMat); skull.scale.set(0.85, 0.9, 1.1); skull.position.y = 0.09; g.add(skull);
      const sockets = new THREE.MeshStandardMaterial({ color: 0x050403 });
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), sockets); e.position.set(s * 0.035, 0.11, -0.095); g.add(e); }
      skull.rotation.set(R() - 0.5, R() * 6, R() - 0.5);
      for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.3 + R() * 0.2, 6), boneMat); b.rotation.set(Math.PI / 2, 0, R() * 6); b.position.set((R() - 0.5) * 0.6, 0.02, (R() - 0.5) * 0.6); g.add(b); }
      g.position.set(wx, 0, wz); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(g);
    } else if (kind === 3) {
      // след волочения
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, TILE * 1.6), new THREE.MeshStandardMaterial({ map: trailTex, transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -1 }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = (sx !== 0 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.3; m.position.set(c.x, 0.01, c.z); m.receiveShadow = true; scene.add(m);
    } else if (kind === 4) {
      // мёртвая лампа в решётке на потолке
      const g = new THREE.Group();
      const bulbMat = new THREE.MeshStandardMaterial({ color: 0x222018, emissive: 0xffd7a0, emissiveIntensity: 0, roughness: 0.2 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), bulbMat); bulb.position.y = -0.3; g.add(bulb);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 4), ropeMat); cord.position.y = -0.12; g.add(cord);
      for (let i = 0; i < 6; i++) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 4, 12, Math.PI), ironMat); w.rotation.y = i / 6 * Math.PI; w.position.y = -0.3; g.add(w); }
      g.position.set(c.x, WALL_H, c.z); g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(g);
      lamps.push({ pos: new THREE.Vector3(c.x, WALL_H - 0.3, c.z), mat: bulbMat, group: g });
    } else if (kind === 6) {
      // царапины ногтями на стене
      const tex = scratchTexture(R);
      const dm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      dm.position.set(c.x + sx * (TILE / 2 - 0.01), 0.9 + R() * 0.6, c.z + sy * (TILE / 2 - 0.01)); dm.lookAt(c.x, dm.position.y, c.z); dm.receiveShadow = true; scene.add(dm);
    } else {
      // паутина в верхнем углу
      const web = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), webMat);
      web.position.set(c.x + sx * (TILE / 2 - 0.35), WALL_H - 0.35, c.z + sy * (TILE / 2 - 0.35));
      web.lookAt(c.x, WALL_H - 0.6, c.z); web.rotateZ(R() * 6); scene.add(web);
    }
  });
  // Рельсы узкоколейки вдоль прямых штреков и брошенные вагонетки
  const railMat = new THREE.MeshStandardMaterial({ color: 0x3d3a36, roughness: 0.35, metalness: 0.9 });
  const sleeperMat = new THREE.MeshStandardMaterial({ ...wood, roughness: 0.95, color: 0x8a7a66 });
  const railSeg = [], sleepers = [];
  for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) {
    if (isWall(x, y)) continue;
    const alongX = isWall(x, y - 1) && isWall(x, y + 1) && !isWall(x - 1, y) && !isWall(x + 1, y) && y % 4 === 1;
    const alongZ = isWall(x - 1, y) && isWall(x + 1, y) && !isWall(x, y - 1) && !isWall(x, y + 1) && x % 4 === 1;
    if (alongX || alongZ) railSeg.push([x, y, alongX]);
  }
  const railGeo = new THREE.BoxGeometry(TILE, 0.05, 0.045);
  const railInst = new THREE.InstancedMesh(railGeo, railMat, railSeg.length * 2);
  const slGeo = new THREE.BoxGeometry(0.16, 0.05, 0.9);
  const slInst = new THREE.InstancedMesh(slGeo, sleeperMat, railSeg.length * 4);
  railSeg.forEach(([x, y, ax], i) => {
    const c = tileCenter(x, y);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ax ? 0 : Math.PI / 2);
    for (let k = 0; k < 2; k++) { const o = k ? 0.3 : -0.3; m4.compose(new THREE.Vector3(c.x + (ax ? 0 : o), 0.075, c.z + (ax ? o : 0)), q, sc); railInst.setMatrixAt(i * 2 + k, m4); }
    for (let k = 0; k < 4; k++) { const o = -TILE / 2 + 0.3 + k * 0.6; m4.compose(new THREE.Vector3(c.x + (ax ? o : 0), 0.025, c.z + (ax ? 0 : o)), q, sc); slInst.setMatrixAt(i * 4 + k, m4); }
  });
  railInst.receiveShadow = slInst.receiveShadow = true; railInst.castShadow = true; scene.add(railInst, slInst);
  const cartSpots = railSeg.filter(() => R() < 0.08).slice(0, 4);
  for (const [x, y, ax] of cartSpots) {
    const c = tileCenter(x, y); const g = new THREE.Group();
    const tub = new THREE.CylinderGeometry(0.62, 0.48, 0.6, 4, 1, true); tub.rotateY(Math.PI / 4); tub.scale(1.25, 1, 0.85);
    const body = new THREE.Mesh(tub, new THREE.MeshStandardMaterial({ color: 0x4a2f22, roughness: 0.75, metalness: 0.55, side: THREE.DoubleSide })); body.position.y = 0.62; g.add(body);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.58), railMat); bottom.position.y = 0.33; g.add(bottom);
    for (const sx2 of [-0.32, 0.32]) for (const sz of [-0.3, 0.3]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 14), railMat); w.rotation.x = Math.PI / 2; w.position.set(sx2, 0.18, sz); g.add(w); }
    const coal = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6, metalness: 0.2 })); coal.scale.set(1.1, 0.35, 0.8); coal.position.y = 0.78; g.add(coal);
    g.position.set(c.x, 0, c.z); g.rotation.y = ax ? 0 : Math.PI / 2; g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(g);
    colliders.push({ x: c.x, z: c.z, r: 0.7 });
  }
  return { wallMat, colliders, candles, lamps, hangers, drips, floorMesh };
}

// Луч видимости по сетке
export function lineOfSight(maze, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz);
  const steps = Math.ceil(d / 0.3);
  for (let i = 1; i < steps; i++) {
    const t = i / steps; const x = a.x + dx * t, z = a.z + dz * t;
    if (maze.isWall(Math.floor(x / TILE), Math.floor(z / TILE))) return false;
  }
  return true;
}
