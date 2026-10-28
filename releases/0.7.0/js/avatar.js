// Персонаж игрока: детальная модель и настраиваемая внешность
import * as THREE from 'three';

export const LOOK_OPTIONS = {
  skin: { label: 'кожа', values: ['#f1c9a5', '#d9a77f', '#b57d55', '#8a5a3b', '#5e3b26'] },
  hair: { label: 'волосы', values: ['#1b1410', '#4a2e1a', '#8a5a2b', '#c9a06a', '#d8d2c8', '#8a1f1a'] },
  hairStyle: { label: 'причёска', values: ['коротко', 'ёжик', 'длинные', 'хвост', 'лысый'] },
  hat: { label: 'на голове', values: ['ничего', 'кепка', 'шапка', 'каска', 'капюшон', 'бандана'] },
  hatColor: { label: 'цвет головного убора', values: ['#1d1f22', '#b8322a', '#2f5f8f', '#3f6b3a', '#d0a020', '#e8e4dc'] },
  jacket: { label: 'куртка', values: ['#2b2e33', '#7a1f1a', '#1f3b5c', '#3d5232', '#b3812a', '#6b4a8a', '#d8d2c4', '#c45a1a'] },
  jacketStyle: { label: 'верх', values: ['куртка', 'худи', 'жилет', 'пуховик'] },
  pants: { label: 'штаны', values: ['#22304a', '#1b1b1d', '#4a4a3c', '#5a3b26', '#7a7a80'] },
  shoes: { label: 'обувь', values: ['#e8e6e0', '#1a1a1a', '#7a1f1a', '#3a2a1a'] },
  glasses: { label: 'очки', values: ['нет', 'обычные', 'тёмные'] },
  backpack: { label: 'рюкзак', values: ['нет', 'есть'] }
};
export const DEFAULT_LOOK = { skin: 1, hair: 0, hairStyle: 0, hat: 0, hatColor: 0, jacket: 0, jacketStyle: 0, pants: 0, shoes: 0, glasses: 0, backpack: 1 };
export function randomLook() { const l = {}; for (const k in LOOK_OPTIONS) l[k] = Math.floor(Math.random() * LOOK_OPTIONS[k].values.length); return l; }
export function cleanLook(l) { const o = { ...DEFAULT_LOOK }; if (l) for (const k in LOOK_OPTIONS) { const v = l[k] | 0; if (v >= 0 && v < LOOK_OPTIONS[k].values.length) o[k] = v; } return o; }

// ткань: мелкая фактура, чтобы одежда не была пластиковой
let FABRIC = null;
function fabric() {
  if (FABRIC) return FABRIC;
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'); const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const k = (y * s + x) * 4; const w = 128 + ((x + y) % 4 < 2 ? 18 : -18) + (Math.random() - 0.5) * 20; img.data[k] = img.data[k + 1] = w; img.data[k + 2] = 255; img.data[k + 3] = 255; }
  g.putImageData(img, 0, 0);
  FABRIC = new THREE.CanvasTexture(c); FABRIC.wrapS = FABRIC.wrapT = THREE.RepeatWrapping; FABRIC.repeat.set(6, 6);
  return FABRIC;
}

function tube(r0, r1, len, mat, seg = 12) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 4); g.translate(0, -len / 2, 0);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = -p.getY(i) / len; const k = 1 + Math.sin(Math.min(1, t * 1.3) * Math.PI) * 0.12; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); return m;
}
const ball = (r, mat, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat); m.scale.set(sx, sy, sz); return m; };

export function makeAvatar(name, lookIn, tagSprite) {
  const L = cleanLook(lookIn), O = LOOK_OPTIONS;
  const col = (k) => new THREE.Color(O[k].values[L[k]]);
  const fab = fabric();
  const skin = new THREE.MeshStandardMaterial({ color: col('skin'), roughness: 0.65 });
  const jacket = new THREE.MeshStandardMaterial({ color: col('jacket'), roughness: 0.85, normalMap: fab, normalScale: new THREE.Vector2(0.35, 0.35) });
  const jacketDark = new THREE.MeshStandardMaterial({ color: col('jacket').multiplyScalar(0.55), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: col('pants'), roughness: 0.9, normalMap: fab, normalScale: new THREE.Vector2(0.4, 0.4) });
  const shoe = new THREE.MeshStandardMaterial({ color: col('shoes'), roughness: 0.6 });
  const sole = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.8 });
  const hairM = new THREE.MeshStandardMaterial({ color: col('hair'), roughness: 0.75 });
  const hatM = new THREE.MeshStandardMaterial({ color: col('hatColor'), roughness: 0.7, normalMap: fab, normalScale: new THREE.Vector2(0.3, 0.3) });
  const metal = new THREE.MeshStandardMaterial({ color: 0x222224, metalness: 0.8, roughness: 0.35 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.4 });
  const style = O.jacketStyle.values[L.jacketStyle];

  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
  const A = { group: g, body, legs: [], arms: [] };
  // ноги: бедро, колено, голень, кроссовок
  const hips = new THREE.Group(); hips.position.y = 0.92; body.add(hips); A.hips = hips;
  hips.add(ball(0.15, pants, 1.15, 0.7, 0.85));
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.09, -0.02, 0); hips.add(hip);
    hip.add(tube(0.075, 0.06, 0.42, pants));
    const knee = new THREE.Group(); knee.position.y = -0.43; hip.add(knee);
    knee.add(ball(0.058, pants));
    knee.add(tube(0.058, 0.045, 0.41, pants));
    const ankle = new THREE.Group(); ankle.position.y = -0.42; knee.add(ankle);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.26), shoe); sh.position.set(0, -0.03, -0.05); ankle.add(sh);
    const toe = ball(0.05, shoe, 1, 0.75, 1); toe.position.set(0, -0.035, -0.17); ankle.add(toe);
    const so = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.025, 0.3), sole); so.position.set(0, -0.07, -0.06); ankle.add(so);
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.1), white); lace.position.set(0, 0.012, -0.08); ankle.add(lace);
    A.legs.push({ hip, knee, s });
  }
  // торс
  const torso = new THREE.Group(); torso.position.y = 0.95; body.add(torso); A.torso = torso;
  const puff = style === 'пуховик';
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.32, 8, 18), jacket); chest.position.y = 0.3; chest.scale.set(puff ? 1.2 : 1.08, 1, puff ? 0.85 : 0.72); torso.add(chest);
  if (puff) for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 28), jacketDark); r.rotation.x = Math.PI / 2; r.scale.set(1.2, 0.86, 1); r.position.y = 0.16 + i * 0.1; torso.add(r); }
  if (style !== 'жилет') {
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.46, 0.01), metal); zip.position.set(0, 0.3, -0.142 * (puff ? 1.17 : 1)); torso.add(zip);
  }
  if (style === 'худи') {
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.03), jacketDark); pocket.position.set(0, 0.17, -0.13); torso.add(pocket);
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.045, 8, 16, Math.PI), jacket); hood.position.set(0, 0.55, 0.06); hood.rotation.x = -0.5; torso.add(hood);
    for (const s of [-1, 1]) { const str = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 4), white); str.position.set(s * 0.04, 0.45, -0.14); torso.add(str); }
  } else {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 8, 18), jacketDark); collar.rotation.x = Math.PI / 2; collar.position.y = 0.55; torso.add(collar);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.025), jacketDark); p.position.set(s * 0.1, 0.16, -0.13); torso.add(p); }
  }
  if (style === 'жилет') { const tee = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 6, 14), new THREE.MeshStandardMaterial({ color: 0x5a5a5e, roughness: 0.9 })); tee.position.y = 0.3; tee.scale.set(1.02, 1, 0.68); torso.add(tee); }
  // рюкзак
  if (L.backpack) {
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.14), jacketDark); bp.position.set(0, 0.32, 0.18); torso.add(bp);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.1, 0.15), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 })); flap.position.set(0, 0.47, 0.18); torso.add(flap);
    for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.02), black); st.position.set(s * 0.1, 0.45, -0.13); st.rotation.x = 0.25; torso.add(st); }
  }
  // руки
  const sleeveMat = style === 'жилет' ? skin : jacket;
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.24, 0.5, 0); torso.add(sh);
    sh.add(ball(0.075, style === 'жилет' ? jacket : sleeveMat));
    sh.add(tube(0.065, 0.052, 0.3, sleeveMat));
    const el = new THREE.Group(); el.position.y = -0.31; sh.add(el);
    el.add(ball(0.052, sleeveMat));
    el.add(tube(0.052, 0.04, 0.27, sleeveMat));
    if (style !== 'жилет') { const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.04, 12), jacketDark); cuff.position.y = -0.26; el.add(cuff); }
    const hand = new THREE.Group(); hand.position.y = -0.3; el.add(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.035), skin); palm.position.y = -0.04; hand.add(palm);
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.03), skin); fingers.position.set(0, -0.1, -0.012); fingers.rotation.x = 0.5; hand.add(fingers);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.035, 4, 8), skin); thumb.position.set(-s * 0.04, -0.05, -0.02); thumb.rotation.z = s * 0.6; hand.add(thumb);
    A.arms.push({ sh, el, hand, s });
  }
  // голова
  const neck = new THREE.Group(); neck.position.y = 0.6; torso.add(neck);
  const nk = tube(0.05, 0.045, 0.14, skin); nk.rotation.x = Math.PI; nk.position.y = -0.03; neck.add(nk);
  const head = new THREE.Group(); head.position.y = 0.16; neck.add(head); A.head = head;
  const skull = ball(0.115, skin, 0.92, 1.08, 1); head.add(skull);
  const jaw = ball(0.09, skin, 0.95, 0.8, 1); jaw.position.set(0, -0.06, -0.015); head.add(jaw);
  for (const s of [-1, 1]) {
    const ear = ball(0.025, skin, 0.5, 1, 0.8); ear.position.set(s * 0.105, 0, 0.01); head.add(ear);
    const eye = ball(0.018, white, 1, 0.85, 0.6); eye.position.set(s * 0.04, 0.015, -0.098); head.add(eye);
    const pupil = ball(0.009, black); pupil.position.set(s * 0.04, 0.015, -0.108); head.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.01), hairM); brow.position.set(s * 0.04, 0.045, -0.103); brow.rotation.z = s * -0.1; head.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.045, 8), skin); nose.position.set(0, -0.012, -0.115); nose.rotation.x = -Math.PI / 2 + 0.25; head.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.006, 0.008), new THREE.MeshStandardMaterial({ color: 0x7a3a32 })); mouth.position.set(0, -0.06, -0.1); head.add(mouth);
  // волосы
  const hs = O.hairStyle.values[L.hairStyle], hat = O.hat.values[L.hat];
  if (hs !== 'лысый' && hat !== 'капюшон') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.122, 24, 14, 0, Math.PI * 2, 0, hs === 'ёжик' ? Math.PI * 0.42 : Math.PI * 0.55), hairM); cap.scale.set(0.95, 1.05, 1.03); cap.position.y = 0.012; cap.rotation.x = -0.18; head.add(cap);
    if (hs === 'длинные') { const back = ball(0.11, hairM, 1, 1.5, 0.6); back.position.set(0, -0.09, 0.06); head.add(back); }
    if (hs === 'хвост') { const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.16, 4, 8), hairM); tail.position.set(0, -0.06, 0.13); tail.rotation.x = 0.4; head.add(tail); }
    if (hs === 'коротко' || hs === 'длинные') { const fringe = ball(0.06, hairM, 1.6, 0.5, 0.6); fringe.position.set(0.02, 0.085, -0.085); head.add(fringe); }
  }
  // головные уборы
  if (hat === 'кепка') {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hatM); c.position.y = 0.025; head.add(c);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20, 1, false, Math.PI * 0.5, Math.PI), hatM); brim.position.set(0, 0.03, -0.1); brim.scale.set(1, 1, 0.9); brim.rotation.x = 0.1; head.add(brim);
    const btn = ball(0.012, hatM); btn.position.y = 0.15; head.add(btn);
  } else if (hat === 'шапка') {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hatM); c.position.y = 0.02; c.scale.y = 1.15; head.add(c);
    const fold = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.022, 8, 28), hatM); fold.rotation.x = Math.PI / 2; fold.position.y = 0.04; head.add(fold);
    const pom = ball(0.035, hatM); pom.position.y = 0.17; head.add(pom);
  } else if (hat === 'каска') {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hatM); c.position.y = 0.03; head.add(c);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 28), hatM); brim.position.y = 0.035; head.add(brim);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.25), hatM); ridge.position.y = 0.16; head.add(ridge);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 12), metal); lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 0.09, -0.13); head.add(lamp);
  } else if (hat === 'капюшон') {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 14, Math.PI * 1.5 + 0.7, Math.PI * 2 - 1.4, 0, Math.PI * 0.7), jacket); c.scale.set(1, 1.08, 1.1); c.position.set(0, 0.0, 0.01); head.add(c);
  } else if (hat === 'бандана') {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.124, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), hatM); c.position.y = 0.015; c.rotation.x = -0.12; head.add(c);
    const knot = ball(0.025, hatM); knot.position.set(0, 0.02, 0.12); head.add(knot);
  }
  if (L.glasses) {
    const fr = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.5 });
    const lensM = L.glasses === 2 ? new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.5 }) : new THREE.MeshStandardMaterial({ color: 0x9fb4c0, transparent: true, opacity: 0.25, roughness: 0.05 });
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 6, 16), fr); r.position.set(s * 0.04, 0.016, -0.112); head.add(r); const l = new THREE.Mesh(new THREE.CircleGeometry(0.023, 16), lensM); l.position.set(s * 0.04, 0.016, -0.113); l.rotation.y = Math.PI; head.add(l); }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.004), fr); bridge.position.set(0, 0.02, -0.113); head.add(bridge);
  }
  // фонарь в правой руке
  const R = A.arms.find((a) => a.s > 0);
  const torch = new THREE.Group(); torch.position.set(0, -0.08, -0.03); torch.rotation.x = Math.PI; R.hand.add(torch); A.torch = torch;
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.18, 12), metal); torch.add(tb);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), new THREE.MeshBasicMaterial({ color: 0xfff2d8 })); lens.position.y = 0.092; lens.rotation.x = -Math.PI / 2; torch.add(lens); A.lens = lens;
  // телефон в левой руке: виден, когда игрок снимает
  const LA = A.arms.find((a) => a.s < 0);
  const phone = new THREE.Group(); phone.position.set(0, -0.1, -0.05); phone.rotation.set(-0.2, 0, 0); LA.hand.add(phone); A.phone = phone; phone.visible = false;
  const pb = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.009), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.35, metalness: 0.6 })); phone.add(pb);
  const scrM = new THREE.MeshBasicMaterial({ color: 0x9fb2c4 }); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.138), scrM); scr.position.z = 0.0048; phone.add(scr); A.phoneScr = scrM;
  const recM = new THREE.MeshBasicMaterial({ color: 0xff2a1a }); const rec = new THREE.Mesh(new THREE.CircleGeometry(0.006, 10), recM); rec.position.set(0.024, 0.06, -0.0048); rec.rotation.y = Math.PI; phone.add(rec); A.phoneRec = rec; rec.visible = false;
  const lensP = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.9 })); lensP.position.set(-0.022, 0.06, -0.0048); lensP.rotation.y = Math.PI; phone.add(lensP);
  g.traverse((o) => { if (o.isMesh) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); o.castShadow = o.geometry.boundingSphere.radius > 0.05; o.receiveShadow = true; } });
  if (tagSprite) { tagSprite.position.y = 2.0; g.add(tagSprite); A.tag = tagSprite; }
  A.walk = 0;
  return A;
}

// поза: ходьба, присед, лежит; pitch — куда смотрит (рука с фонарём следует)
export function poseAvatar(A, { moving, running, crouch, down, pitch = 0, dt = 0.016, relaxed = false, phone = false, rec = false }) {
  A.walk += dt * (moving ? (running ? 11 : crouch ? 5 : 7.5) : 0);
  const s = moving ? Math.sin(A.walk) : 0, amp = running ? 0.8 : crouch ? 0.35 : 0.55;
  A.legs.forEach((l, i) => {
    const ph = i ? -s : s;
    l.hip.rotation.x = crouch ? 0.9 + ph * amp * 0.5 : ph * amp;
    l.knee.rotation.x = crouch ? -1.6 : -Math.max(0, -ph) * amp * 1.4 - 0.05;
  });
  A.hips.position.y = crouch ? 0.6 : 0.92 + Math.abs(Math.cos(A.walk)) * (moving ? 0.03 : 0);
  A.torso.position.y = A.hips.position.y + 0.03;
  A.torso.rotation.x = crouch ? -0.35 : running ? -0.15 : 0;
  A.arms.forEach((a) => {
    if (a.s > 0 && !relaxed) { a.sh.rotation.set(1.2 + pitch * 0.9 - A.torso.rotation.x, 0, 0.08); a.el.rotation.x = 0.25; }
    else if (a.s < 0 && phone && !relaxed && !down) { a.sh.rotation.set(1.15 + pitch * 0.9 - A.torso.rotation.x, 0, -0.35); a.el.rotation.x = 0.55; }
    else if (relaxed) { a.sh.rotation.set(0.08 + Math.sin(A.walk + a.s) * 0.02, 0, a.s * -0.08); a.el.rotation.x = 0.25 + (a.s > 0 ? 0.35 : 0); }
    else { a.sh.rotation.set(-s * amp * 0.7 * 0.8, 0, -0.1); a.el.rotation.x = 0.3 + (running ? 0.7 : 0); }
  });
  A.head.rotation.x = -pitch * 0.5 + (crouch ? 0.25 : 0);
  if (A.phone) { A.phone.visible = phone && !down; A.phoneRec.visible = rec && Math.sin(performance.now() / 160) > -0.2; }
  A.body.rotation.x = down ? -1.45 : 0; A.body.position.y = down ? 0.18 : 0; A.body.position.z = down ? 0.95 : 0;
}
