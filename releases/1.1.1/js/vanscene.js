// Главное меню: ночная стоянка у заброшенного завода, «буханка» с открытой дверью, рядом ваша компания
import * as THREE from 'three';
import { makeMaps, noise2 } from './world.js';
import { makeAvatar, poseAvatar } from './avatar.js';
import { propMats } from './props.js';

function roundedBoxGeo(w, h, d, r, seg = 4) {
  const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: r * 0.6, bevelSize: r * 0.6, bevelSegments: seg, curveSegments: seg });
  g.translate(0, 0, -d / 2); g.computeVertexNormals(); return g;
}

function labelTex(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  g.fillStyle = 'rgba(230,40,30,.95)'; g.beginPath(); g.arc(90, 128, 44, 0, 7); g.fill();
  g.font = '600 120px Cormorant, Georgia, serif'; g.fillStyle = 'rgba(235,228,215,.92)'; g.textBaseline = 'middle'; g.fillText(text.toUpperCase(), 170, 132);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// УАЗ-452: кузов-«буханка», двухцветный, открытая сдвижная дверь, внутри мониторы и тёплый свет
export function makeVan(chanName) {
  const g = new THREE.Group();
  const N = noise2(901);
  const paint = makeMaps(512, (u, v) => {
    const n = N(u * 8, v * 8, 4), dirt = Math.max(0, N(u * 3 + 2, v * 2, 3) - 0.5) * 1.5 + Math.max(0, 0.35 - v) * 1.4;
    const two = v > 0.62; // светлая полоса сверху
    const k = 0.85 + n * 0.25;
    let r = two ? 196 * k : 74 * k, gg = two ? 192 * k : 92 * k, b = two ? 176 * k : 62 * k;
    const d = Math.min(0.7, dirt); r = r * (1 - d) + 70 * d; gg = gg * (1 - d) + 58 * d; b = b * (1 - d) + 44 * d;
    const scr = Math.abs(N(u * 70, v * 4, 2) - 0.5) < 0.006;
    if (scr) { r += 40; gg += 40; b += 40; }
    return { h: 0.5 + n * 0.1, r, g: gg, b, rough: 0.45 + n * 0.25 + d * 0.3 };
  }, 21);
  const body = new THREE.MeshStandardMaterial({ ...paint, color: 0xffffff, roughness: 1, metalness: 0.35 });
  const M = propMats();
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0e12, roughness: 0.05, metalness: 0.9 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xbfc2c4, metalness: 1, roughness: 0.2 });
  const L = 4.4, W = 1.95, H = 1.9, base = 0.55;
  // ExtrudeGeometry вытягивается по Z: ширина — профиль, длина — глубина; поворотом длину кладём вдоль X
  const shellGeo = roundedBoxGeo(W - 0.3, H, L - 0.3, 0.32);
  const shell = new THREE.Mesh(shellGeo, body); shell.rotation.y = Math.PI / 2; shell.position.y = base + H / 2;
  // UV для краски: по высоте
  const pos = shellGeo.attributes.position, uv = shellGeo.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getZ(i) / L + 0.5), pos.getY(i) / H + 0.5);
  g.add(shell);
  // окна: лобовое, боковые, задние
  const win = (w, h, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  win(0.8, 0.6, L / 2 + 0.07, base + H - 0.5, -0.42, Math.PI / 2); win(0.8, 0.6, L / 2 + 0.07, base + H - 0.5, 0.42, Math.PI / 2);
  for (const x of [-1.2, 0.0, 1.4]) win(0.8, 0.5, x, base + H - 0.45, -W / 2 - 0.08, Math.PI);
  for (const x of [-1.2, 0.0, 1.4]) win(0.8, 0.5, x, base + H - 0.45, W / 2 + 0.08, 0);
  // фары, решётка, бампер
  for (const z of [-0.62, 0.62]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 24), chrome); ring.rotation.y = Math.PI / 2; ring.position.set(L / 2 + 0.08, base + 0.55, z); g.add(ring);
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xfff0cc, emissiveIntensity: 3 })); lamp.rotation.y = Math.PI / 2; lamp.position.set(L / 2 + 0.085, base + 0.55, z); g.add(lamp);
  }
  for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.5), rubber); s.position.set(L / 2 + 0.07, base + 0.32 + i * 0.07, 0); g.add(s); }
  for (const x of [L / 2 + 0.1, -L / 2 - 0.1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, W - 0.1), M.steel); b.position.set(x, base + 0.15, 0); g.add(b); }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.6 })); plate.rotation.y = Math.PI / 2; plate.position.set(L / 2 + 0.17, base + 0.15, 0); g.add(plate);
  // колёса
  for (const x of [-1.35, 1.35]) for (const z of [-W / 2 + 0.12, W / 2 - 0.12]) {
    const w = new THREE.Group(); w.position.set(x, 0.42, z); g.add(w);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.13, 12, 28), rubber); w.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 20), M.steel); rim.rotation.x = Math.PI / 2; w.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 12), chrome); hub.rotation.x = Math.PI / 2; w.add(hub);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 6, 20, Math.PI), body); arch.position.set(x, 0.42, z * 1.02); g.add(arch);
  }
  // запаска сзади, багажник на крыше, антенна
  const spare = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.11, 10, 24), rubber); spare.rotation.y = Math.PI / 2; spare.position.set(-L / 2 - 0.12, base + 0.95, 0.35); g.add(spare);
  const rack = new THREE.Group(); rack.position.y = base + H + 0.12; g.add(rack);
  for (const z of [-0.7, 0.7]) { const r = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 0.04), M.steel); r.position.z = z; rack.add(r); }
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1.44), M.steel); r.position.x = -1.5 + i * 0.6; rack.add(r); }
  const case1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.6), new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6 })); case1.position.set(-0.6, 0.18, -0.2); rack.add(case1);
  const case2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.5), new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.8 })); case2.position.set(0.5, 0.15, 0.3); rack.add(case2);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 1.2, 6), chrome); ant.position.set(1.4, 0.6, 0.6); rack.add(ant);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5, side: THREE.DoubleSide })); dish.position.set(1.0, 0.35, -0.4); dish.rotation.set(-1.0, 0.5, 0); rack.add(dish);
  // открытая сдвижная дверь: тёмный проём, внутри тёплый свет, мониторы
  const doorZ = W / 2 + 0.075;
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.5), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1, emissive: 0x2a1406, emissiveIntensity: 0.6 })); hole.position.set(-0.45, base + 0.85, doorZ); g.add(hole);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.55, 0.05), body); door.position.set(-1.5, base + 0.86, doorZ + 0.08); g.add(door);
  const screenTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 96; const gg = c.getContext('2d'); gg.fillStyle = '#0a1a14'; gg.fillRect(0, 0, 128, 96); gg.fillStyle = '#3fbf7a'; for (let i = 0; i < 12; i++) gg.fillRect(8, 8 + i * 7, 20 + Math.random() * 90, 3); gg.fillStyle = '#e0392c'; gg.beginPath(); gg.arc(112, 12, 5, 0, 7); gg.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  for (let i = 0; i < 2; i++) { const mon = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), new THREE.MeshStandardMaterial({ map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 1.4 })); mon.position.set(-0.7 + i * 0.42, base + 1.1, doorZ - 0.25); g.add(mon); }
  const warm = new THREE.PointLight(0xffa860, 6, 6, 1.6); warm.position.set(-0.45, base + 1.4, 0.3); g.add(warm);
  // наклейка канала
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: labelTex(chanName), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 })); lbl.position.set(0.9, base + 0.75, doorZ + 0.01); g.add(lbl);
  const lbl2 = lbl.clone(); lbl2.rotation.y = Math.PI; lbl2.position.z = -doorZ - 0.01; g.add(lbl2);
  // зеркала
  for (const z of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), M.steel); arm.rotation.x = Math.PI / 2; arm.position.set(L / 2 - 0.4, base + 1.25, z * (W / 2 + 0.12)); g.add(arm); const mr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.14), rubber); mr.position.set(L / 2 - 0.4, base + 1.25, z * (W / 2 + 0.28)); g.add(mr); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { warm, label: lbl, label2: lbl2 };
  return g;
}

export function buildVanScene(scene, quality, chanName) {
  const low = quality === 'low';
  scene.fog = new THREE.FogExp2(0x0a0e16, 0.022);
  scene.background = new THREE.Color(0x05070c);
  // земля: асфальт с лужами
  const N = noise2(911), N2 = noise2(912);
  const asph = makeMaps(low ? 256 : 512, (u, v) => {
    const n = N(u * 30, v * 30, 4), m = N2(u * 90, v * 90, 2), pud = N(u * 3 + 5, v * 3, 4);
    const crack = Math.abs(N2(u * 6, v * 6, 5) - 0.5) < 0.008;
    let k = 38 + n * 22 + m * 12 - (crack ? 14 : 0); let rough = 0.9;
    if (pud > 0.6) { rough = 0.04; k *= 0.5; }
    return { h: n * 0.5 + m * 0.3 - (crack ? 0.3 : 0), r: k, g: k * 1.0, b: k * 1.04, rough };
  }, 31);
  for (const k of ['map', 'roughnessMap', 'normalMap', 'aoMap']) asph[k].repeat.set(10, 10);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ ...asph, roughness: 1 })); ground.receiveShadow = true; scene.add(ground);
  // небо: звёзды и луна
  const sg = new THREE.BufferGeometry(); const sp = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.08; sp[i * 3] = Math.cos(a) * Math.cos(e) * 120; sp[i * 3 + 1] = Math.sin(e) * 120; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 120; }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbfc8d8, size: 0.35, sizeAttenuation: true, fog: false })));
  const moonC = document.createElement('canvas'); moonC.width = moonC.height = 128; const mg = moonC.getContext('2d'); const grd = mg.createRadialGradient(64, 64, 10, 64, 64, 64); grd.addColorStop(0, 'rgba(230,235,245,1)'); grd.addColorStop(0.35, 'rgba(210,220,235,.9)'); grd.addColorStop(0.45, 'rgba(150,170,200,.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); mg.fillStyle = grd; mg.fillRect(0, 0, 128, 128);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(moonC), fog: false, depthWrite: false })); moon.position.set(-40, 45, -70); moon.scale.setScalar(16); scene.add(moon);
  const moonL = new THREE.DirectionalLight(0x8aa0c8, 0.9); moonL.position.set(-40, 45, -70); scene.add(moonL);
  scene.add(new THREE.HemisphereLight(0x3a4668, 0x0e0a08, 0.8));
  // заброшенный завод: корпус с окнами, труба, забор
  const brickN = noise2(921);
  const fac = makeMaps(512, (u, v) => {
    const wx = (u * 16) % 1, wy = (v * 6) % 1; const isWin = wx > 0.25 && wx < 0.75 && wy > 0.3 && wy < 0.8;
    const n = brickN(u * 40, v * 20, 4); const lit = isWin && ((Math.floor(u * 16) * 7 + Math.floor(v * 6) * 13) % 23 === 0);
    if (isWin) return { h: 0, r: lit ? 120 : 6, g: lit ? 80 : 7, b: lit ? 40 : 9, rough: 0.1 };
    const k = 55 + n * 30; return { h: 0.5 + n * 0.3, r: k * 1.0, g: k * 0.8, b: k * 0.68, rough: 0.9 };
  }, 41);
  fac.map.repeat.set(1, 1);
  const factory = new THREE.Mesh(new THREE.BoxGeometry(40, 12, 10), new THREE.MeshStandardMaterial({ ...fac, roughness: 1, emissive: 0xffffff, emissiveMap: fac.map, emissiveIntensity: 0.35 })); factory.position.set(-2, 6, -26); scene.add(factory);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(41, 0.6, 11), new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.9 })); roof.position.set(-2, 12.3, -26); scene.add(roof);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 26, 16), new THREE.MeshStandardMaterial({ ...fac, roughness: 1 })); chimney.position.set(12, 13, -30); scene.add(chimney);
  // забор из сетки
  const fenceC = document.createElement('canvas'); fenceC.width = fenceC.height = 128; const fg = fenceC.getContext('2d'); fg.strokeStyle = 'rgba(160,160,150,1)'; fg.lineWidth = 3; for (let i = -128; i < 256; i += 16) { fg.beginPath(); fg.moveTo(i, 0); fg.lineTo(i + 128, 128); fg.stroke(); fg.beginPath(); fg.moveTo(i + 128, 0); fg.lineTo(i, 128); fg.stroke(); }
  const ft = new THREE.CanvasTexture(fenceC); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(20, 1);
  const fence = new THREE.Mesh(new THREE.PlaneGeometry(50, 2.6), new THREE.MeshStandardMaterial({ map: ft, alphaMap: ft, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 })); fence.position.set(-2, 1.3, -14); scene.add(fence);
  const M = propMats();
  const postG = new THREE.CylinderGeometry(0.05, 0.05, 2.9, 6); const posts = new THREE.InstancedMesh(postG, M.steel, 17); const m4 = new THREE.Matrix4();
  for (let i = 0; i < 17; i++) { m4.makeTranslation(-27 + i * 3.125, 1.45, -14); posts.setMatrixAt(i, m4); } scene.add(posts);
  // ёлки
  const treeG = new THREE.ConeGeometry(1.4, 6, 8); treeG.translate(0, 3, 0);
  const trees = new THREE.InstancedMesh(treeG, new THREE.MeshStandardMaterial({ color: 0x0b1410, roughness: 1 }), 40);
  for (let i = 0; i < 40; i++) { const a = -0.3 + Math.random() * 3.6, r = 18 + Math.random() * 22; const s = 0.7 + Math.random() * 0.9; m4.compose(new THREE.Vector3(Math.cos(a) * r + 6, 0, Math.sin(a) * r * 0.6 + 6), new THREE.Quaternion(), new THREE.Vector3(s, s * (0.8 + Math.random() * 0.5), s)); trees.setMatrixAt(i, m4); }
  scene.add(trees);
  // фонарный столб с натриевой лампой, мигает
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 8), M.steel); pole.position.set(7, 3.5, -6); scene.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), M.steel); arm.position.set(6.3, 7, -6); scene.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.25), new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0xffa040, emissiveIntensity: 2 })); head.position.set(5.6, 6.92, -6); scene.add(head);
  const sodium = new THREE.SpotLight(0xff9a40, 120, 25, 0.9, 0.6, 1.6); sodium.position.set(5.6, 6.8, -6); sodium.target.position.set(4, 0, -3); sodium.castShadow = !low; sodium.shadow.mapSize.set(1024, 1024); scene.add(sodium, sodium.target);
  // костёр-банка у фургона? нет — тёплый свет из двери и фары
  const van = makeVan(chanName); van.position.set(0, 0, 0); van.rotation.y = -0.35; scene.add(van);
  const headL = [];
  for (const z of [-0.62, 0.62]) {
    const s = new THREE.SpotLight(0xfff0d8, 60, 30, 0.45, 0.5, 1.5);
    const p = new THREE.Vector3(2.25, 1.1, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.35); s.position.copy(p);
    const t = new THREE.Vector3(12, 0, z * 3).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.35); s.target.position.copy(t);
    s.castShadow = !low && z > 0; s.shadow.mapSize.set(1024, 1024); scene.add(s, s.target); headL.push(s);
  }
  // походный фонарь на земле у компании
  const lantern = new THREE.Group(); lantern.position.set(0.6, 0, 3.4); scene.add(lantern);
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.06, 12), M.steel); lb.position.y = 0.03; lantern.add(lb);
  const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 12), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc070, emissiveIntensity: 3 })); lg.position.y = 0.15; lantern.add(lg);
  const lt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.05, 12), M.steel); lt.position.y = 0.27; lantern.add(lt);
  const lanternL = new THREE.PointLight(0xffb060, 7, 9, 1.6); lanternL.position.set(0.6, 0.35, 3.4); lanternL.castShadow = !low; lanternL.shadow.mapSize.set(512, 512); scene.add(lanternL);
  const party = new THREE.Group(); scene.add(party);
  const spots = [[0.9, 3.0, 2.9], [-0.9, 3.2, 3.3], [2.4, 2.5, 2.5], [-2.5, 2.9, 3.6]];
  let avatars = [];
  function setParty(list) {
    avatars.forEach((a) => party.remove(a.group)); avatars = [];
    list.slice(0, 4).forEach((p, i) => {
      const A = makeAvatar(p.name, p.look); const [x, z, ry] = spots[i];
      A.group.position.set(x, 0, z); A.group.rotation.y = ry + (Math.random() - 0.5) * 0.3; party.add(A.group);
      A.idle = Math.random() * 10; avatars.push(A);
    });
  }
  const cam = { a: 0 };
  function update(camera, dt, t) {
    // медленный облёт
    const a = 0.25 + Math.sin(t * 0.05) * 0.22;
    camera.position.set(Math.sin(a) * 7.2 + 0.5, 1.55 + Math.sin(t * 0.13) * 0.12, Math.cos(a) * 7.2 + 2);
    camera.lookAt(-0.2, 1.15, 1.2);
    const fl = Math.sin(t * 17) > 0.96 || (Math.sin(t * 0.6) > 0.95 && Math.random() < 0.5);
    sodium.intensity = fl ? 15 : 120; head.material.emissiveIntensity = fl ? 0.2 : 2;
    van.userData.warm.intensity = 3.5 + Math.sin(t * 7) * 0.2 + Math.random() * 0.3;
    lanternL.intensity = 6.5 + Math.sin(t * 5) * 0.3 + Math.random() * 0.3;
    avatars.forEach((A, i) => { A.idle += dt; poseAvatar(A, { moving: false, dt, relaxed: true, pitch: 0 }); A.head.rotation.y = Math.sin(A.idle * 0.3 + i) * 0.5; });
  }
  function setName(name) { const t = labelTex(name); van.userData.label.material.map = t; van.userData.label2.material.map = t; van.userData.label.material.needsUpdate = true; van.userData.label2.material.needsUpdate = true; }
  return { update, setParty, setName, van };
}
