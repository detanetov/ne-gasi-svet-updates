// Детальные пропсы: вагонетка, ящики, материалы ржавого металла и досок
import * as THREE from 'three';
import { makeMaps, noise2 } from './world.js';

let MAT = null;
export function propMats() {
  if (MAT) return MAT;
  // ржавая сталь с облезлой краской
  const N = noise2(301), N2 = noise2(302), N3 = noise2(303);
  const paint = makeMaps(512, (u, v) => {
    const n = N(u * 10, v * 10, 5), rust = N2(u * 7, v * 7, 5) * 0.8 + N(u * 25, v * 25, 3) * 0.2, sc = N3(u * 60, v * 3, 2);
    const scratch = Math.abs(sc - 0.5) < 0.01;
    const drip = Math.max(0, N2(u * 30, v * 1.5, 3) - 0.62) * 3 * v;
    const r0 = rust + drip * 0.5;
    let r, g, b, rough, h;
    if (r0 > 0.58) { const k = 0.7 + n * 0.5; r = 92 * k; g = 46 * k; b = 24 * k; rough = 0.9; h = 0.35 + n * 0.3; } // ржавчина
    else if (r0 > 0.52) { r = 38; g = 30; b = 26; rough = 0.8; h = 0.5; } // край скола
    else { const k = 0.85 + n * 0.25; r = 52 * k; g = 60 * k; b = 54 * k; rough = 0.55 + n * 0.2; h = 0.6; } // старая зелёная краска
    if (scratch) { r = 120; g = 115; b = 105; rough = 0.3; h = 0.55; }
    const dirt = Math.max(0, v - 0.6) * 1.6; r *= 1 - dirt * 0.5; g *= 1 - dirt * 0.5; b *= 1 - dirt * 0.5;
    return { h, r, g, b, rough };
  }, 9);
  const steel = makeMaps(256, (u, v) => {
    const n = N(u * 14 + 5, v * 14, 4), rust = N2(u * 6 + 3, v * 6, 4);
    const k = rust > 0.55 ? 0.6 : 1;
    return { h: n, r: (62 + n * 30) * k + (rust > 0.55 ? 30 : 0), g: (58 + n * 26) * k, b: (54 + n * 22) * k, rough: rust > 0.55 ? 0.85 : 0.4 };
  }, 10);
  const WN = noise2(311), WN2 = noise2(312);
  const planks = makeMaps(512, (u, v) => {
    const rows = 4; const row = Math.floor(v * rows), fy = (v * rows) % 1;
    const gap = fy < 0.03 || fy > 0.97;
    const n = WN(u * 3 + row * 7, v * 30, 4);
    const grain = Math.sin(u * 22 + n * 7 + row * 5) * 0.5 + 0.5;
    const knot = Math.hypot(((u * 3 + row * 0.37) % 1) - 0.5, (fy - 0.5) * 0.5) < 0.04;
    const wear = WN2(u * 5, v * 5, 3);
    let k = gap ? 10 : 36 + grain * 16 + n * 20 - (knot ? 18 : 0);
    k *= 0.65 + wear * 0.45; const dirt = Math.max(0, WN2(u * 2 + 4, v * 2, 3) - 0.5) * 1.4; k *= 1 - dirt * 0.5;
    return { h: gap ? 0 : 0.5 + grain * 0.15 - (knot ? 0.2 : 0), r: k * 1.0, g: k * 0.76, b: k * 0.52, rough: 0.85 };
  }, 11);
  const mk = (m, o) => new THREE.MeshStandardMaterial({ ...m, color: 0xffffff, roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2), ...o });
  MAT = {
    paint: mk(paint, { metalness: 0.45 }),
    steel: mk(steel, { metalness: 0.85 }),
    wood: mk(planks, {}),
    coal: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.35, metalness: 0.25, flatShading: true }),
    rivet: new THREE.MeshStandardMaterial({ color: 0x3a332c, roughness: 0.5, metalness: 0.9 })
  };
  return MAT;
}

function rivetRow(group, mat, from, to, n, r = 0.012) {
  const geo = new THREE.SphereGeometry(r, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const inst = new THREE.InstancedMesh(geo, mat, n); const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion();
  const dir = new THREE.Vector3().subVectors(to.p, from.p);
  for (let i = 0; i < n; i++) {
    const p = from.p.clone().addScaledVector(dir, (i + 0.5) / n);
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.n);
    m4.compose(p, q, new THREE.Vector3(1, 1, 1)); inst.setMatrixAt(i, m4);
  }
  inst.castShadow = true; group.add(inst);
}

// Вагонетка: кузов из листов с рёбрами и заклёпками, рама, колёсные пары с ребордами, уголь кусками
export function makeCart(seed = 1) {
  const M = propMats(); const g = new THREE.Group();
  let s = seed; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const L = 1.25, W = 0.82, Hh = 0.62, bot = 0.36, taper = 0.12; // кузов сужается книзу
  const top = bot + Hh;
  // боковые листы (трапеции) с толщиной
  const plate = (w1, w2, h, depth) => {
    const sh = new THREE.Shape(); sh.moveTo(-w1 / 2, 0); sh.lineTo(w1 / 2, 0); sh.lineTo(w2 / 2, h); sh.lineTo(-w2 / 2, h); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 1 });
    // UV по размеру
    const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.9 + 0.5, p.getY(i) * 0.9);
    return geo;
  };
  const sideGeo = plate(L - taper * 2, L, Hh, 0.02);
  const endGeo = plate(W - taper * 2, W, Hh, 0.02);
  const tilt = Math.atan2(taper, Hh);
  for (const sgn of [-1, 1]) {
    const side = new THREE.Mesh(sideGeo, M.paint); side.position.set(0, bot, sgn * (W / 2 - taper)); side.rotation.x = sgn * tilt; if (sgn > 0) side.rotation.y = Math.PI; g.add(side);
    const end = new THREE.Mesh(endGeo, M.paint); end.position.set(sgn * (L / 2 - taper), bot, 0); end.rotation.y = sgn * Math.PI / 2; end.rotation.x = 0; end.rotation.z = 0;
    end.rotateX(sgn > 0 ? tilt : tilt); g.add(end);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(L - taper * 2, 0.02, W - taper * 2), M.paint); floor.position.y = bot + 0.01; g.add(floor);
  // верхняя обвязка из уголка
  const rimH = new THREE.BoxGeometry(L + 0.04, 0.04, 0.04), rimW = new THREE.BoxGeometry(0.04, 0.04, W + 0.04);
  for (const sgn of [-1, 1]) {
    const a = new THREE.Mesh(rimH, M.steel); a.position.set(0, top, sgn * (W / 2 + 0.005)); g.add(a);
    const b = new THREE.Mesh(rimW, M.steel); b.position.set(sgn * (L / 2 + 0.005), top, 0); g.add(b);
  }
  // вертикальные рёбра жёсткости
  const rib = new THREE.BoxGeometry(0.035, Hh, 0.025);
  for (const sgn of [-1, 1]) for (const x of [-0.38, 0, 0.38]) {
    const r = new THREE.Mesh(rib, M.steel); r.position.set(x * (1 - 0.1), bot + Hh / 2, sgn * (W / 2 - taper / 2 + 0.02)); r.rotation.x = sgn * tilt; g.add(r);
  }
  // заклёпки по рёбрам и обвязке
  for (const sgn of [-1, 1]) {
    rivetRow(g, M.rivet, { p: new THREE.Vector3(-L / 2, top - 0.03, sgn * (W / 2 + 0.03)), n: new THREE.Vector3(0, 0, sgn) }, { p: new THREE.Vector3(L / 2, top - 0.03, sgn * (W / 2 + 0.03)) }, 14);
    rivetRow(g, M.rivet, { p: new THREE.Vector3(-L / 2 + taper, bot + 0.04, sgn * (W / 2 - taper + 0.03)), n: new THREE.Vector3(0, 0, sgn) }, { p: new THREE.Vector3(L / 2 - taper, bot + 0.04, sgn * (W / 2 - taper + 0.03)) }, 11);
  }
  // рама и буфера
  const frame = new THREE.BoxGeometry(L + 0.15, 0.08, 0.07);
  for (const sgn of [-1, 1]) { const f = new THREE.Mesh(frame, M.steel); f.position.set(0, bot - 0.05, sgn * 0.27); g.add(f); }
  for (const sgn of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.7), M.steel); beam.position.set(sgn * (L / 2 + 0.05), bot - 0.04, 0); g.add(beam);
    const buf = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 12), M.steel); buf.rotation.z = Math.PI / 2; buf.position.set(sgn * (L / 2 + 0.13), bot - 0.04, 0); g.add(buf);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12, Math.PI * 1.5), M.steel); hook.position.set(sgn * (L / 2 + 0.2), bot - 0.07, 0); hook.rotation.y = Math.PI / 2; g.add(hook);
  }
  // колёсные пары: обод, реборда, спицы, ось, буксы
  const wheelR = 0.14;
  const rimGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.05, 24); rimGeo.rotateX(Math.PI / 2);
  const flangeGeo = new THREE.CylinderGeometry(wheelR + 0.018, wheelR + 0.018, 0.012, 24); flangeGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12); hubGeo.rotateX(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.02, wheelR * 1.8, 0.02);
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.4, metalness: 0.9 });
  for (const x of [-0.34, 0.34]) {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.74, 10), dark); axle.rotation.x = Math.PI / 2; axle.position.set(x, wheelR + 0.02, 0); g.add(axle);
    for (const sgn of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(x, wheelR + 0.02, sgn * 0.3); g.add(w);
      const rimM = new THREE.Mesh(rimGeo, dark); w.add(rimM);
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(wheelR - 0.03, wheelR - 0.03, 0.02, 24).rotateX(Math.PI / 2), M.steel); w.add(disk);
      const fl = new THREE.Mesh(flangeGeo, dark); fl.position.z = -sgn * 0.022; w.add(fl);
      w.add(new THREE.Mesh(hubGeo, M.steel));
      for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(spokeGeo, M.steel); sp.rotation.z = k * Math.PI / 3; sp.position.z = sgn * 0.012; w.add(sp); }
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.06), M.steel); box.position.set(x, wheelR + 0.04, sgn * 0.37); g.add(box);
    }
  }
  // уголь: груда отдельных кусков
  const coalGeo = new THREE.IcosahedronGeometry(1, 0);
  const n = 70; const coal = new THREE.InstancedMesh(coalGeo, M.coal, n); const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const rx = (R() - 0.5) * (L - 0.3), rz = (R() - 0.5) * (W - 0.25);
    const dome = 1 - (rx * rx) / ((L / 2) ** 2) - (rz * rz) / ((W / 2) ** 2);
    const y = top - 0.12 + Math.max(0, dome) * 0.2 + R() * 0.05;
    const sc = 0.04 + R() * 0.06;
    q.setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6));
    m4.compose(new THREE.Vector3(rx, y, rz), q, new THREE.Vector3(sc * (0.8 + R() * 0.6), sc * (0.6 + R() * 0.5), sc * (0.8 + R() * 0.6)));
    coal.setMatrixAt(i, m4);
  }
  coal.castShadow = true; coal.receiveShadow = true; g.add(coal);
  const fill = new THREE.Mesh(new THREE.BoxGeometry(L - 0.2, 0.18, W - 0.18), M.coal); fill.position.y = top - 0.2; g.add(fill);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Ящик: доски с щелями, бруски по краям, гвозди, металлические уголки
export function makeCrate(size = 0.7, seed = 1) {
  const M = propMats(); const g = new THREE.Group(); const s = size;
  let z = seed; const R = () => { z = (z * 16807) % 2147483647; return z / 2147483647; };
  const plankT = 0.025, nPl = 4, ph = s / nPl;
  const wood = M.wood;
  for (const [ax, sgn] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
    for (let i = 0; i < nPl; i++) {
      const geo = new THREE.BoxGeometry(ax === 'x' ? plankT : s, ph - 0.012, ax === 'x' ? s : plankT);
      const uv = geo.attributes.uv; const off = R(); for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.9 + off, uv.getY(k) * 0.22 + i * 0.25);
      const p = new THREE.Mesh(geo, wood);
      p.position.set(ax === 'x' ? sgn * (s / 2 - plankT / 2) : 0, ph * (i + 0.5), ax === 'z' ? sgn * (s / 2 - plankT / 2) : 0);
      p.rotation.y = (R() - 0.5) * 0.01; g.add(p);
    }
  }
  const lid = new THREE.Mesh(new THREE.BoxGeometry(s, plankT, s), wood); lid.position.y = s - plankT / 2; g.add(lid);
  // бруски по рёбрам
  const bar = new THREE.BoxGeometry(0.05, s, 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const b = new THREE.Mesh(bar, wood); b.position.set(sx * (s / 2 - 0.02), s / 2, sz * (s / 2 - 0.02)); g.add(b); }
  const diag = new THREE.BoxGeometry(0.04, Math.hypot(s, s) * 0.92, 0.03);
  for (const sgn of [-1, 1]) { const d = new THREE.Mesh(diag, wood); d.position.set(0, s / 2, sgn * (s / 2 + 0.005)); d.rotation.z = Math.PI / 4 * sgn; g.add(d); }
  // уголки
  const cornerGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [0, 1]) { const c = new THREE.Mesh(cornerGeo, M.steel); c.scale.set(1, 0.4, 1); c.position.set(sx * (s / 2 - 0.035), sy ? s - 0.02 : 0.02, sz * (s / 2 - 0.035)); g.add(c); }
  // трафарет
  if (R() < 0.6) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const gg = c.getContext('2d');
    gg.font = 'bold 54px "Courier New", monospace'; gg.fillStyle = 'rgba(20,16,12,.75)'; gg.textAlign = 'center';
    gg.fillText(['АММОНИТ', 'ГЛУБОКАЯ', 'НЕ КАНТ.', 'ЗИП-7'][Math.floor(R() * 4)], 128, 80);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.7, s * 0.35), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    label.position.set(0, s * 0.5, s / 2 + 0.004); g.add(label);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
