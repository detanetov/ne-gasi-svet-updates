// Звук. Всё синтезируется на лету, источники в мире — через 3D-панорамирование (HRTF)
export class Sound {
  constructor() { this.ctx = null; this.vol = 0.8; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = this.vol;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
    this.master.connect(comp).connect(C.destination);
    const len = C.sampleRate * 3.5, ir = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3) * (i < 2000 ? i / 2000 : 1); }
    this.verb = C.createConvolver(); this.verb.buffer = ir;
    const vg = C.createGain(); vg.gain.value = 0.55; this.verb.connect(vg).connect(this.master);
    this.noiseBuf = C.createBuffer(1, C.sampleRate * 3, C.sampleRate);
    const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // коричневый шум для гула
    this.brownBuf = C.createBuffer(1, C.sampleRate * 4, C.sampleRate);
    const bd = this.brownBuf.getChannelData(0); let last = 0; for (let i = 0; i < bd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    this.dist = C.createWaveShaper(); const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6) * 0.9; } this.dist.curve = curve;
    this.dist.connect(this.master);
    this.L = C.listener;
    this._ambient(); this._monsterLoop();
    this._heartT = 0;
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  get t() { return this.ctx.currentTime; }
  out(dry = 1, wet = 0.5) { const g = this.ctx.createGain(); g.gain.value = dry; g.connect(this.master); if (wet) { const w = this.ctx.createGain(); w.gain.value = wet; g.connect(w).connect(this.verb); } return g; }
  // точка в мире
  at(pos, gain = 1, wet = 0.8, ref = 2) {
    const C = this.ctx; const p = C.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1.3; p.maxDistance = 60;
    p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1.5; p.positionZ.value = pos.z;
    const g = C.createGain(); g.gain.value = gain; g.connect(p); p.connect(this.master);
    const w = C.createGain(); w.gain.value = wet; p.connect(w).connect(this.verb);
    return g;
  }
  setListener(pos, fwd) {
    if (!this.ctx) return; const L = this.L, t = this.t;
    if (L.positionX) { L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02); L.forwardX.setTargetAtTime(fwd.x, t, 0.02); L.forwardY.setTargetAtTime(fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(fwd.z, t, 0.02); L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }
  noise(dur, freq, q, gain, dest, type = 'lowpass', t0 = 0, buf) {
    const C = this.ctx, t = C.currentTime + t0;
    const s = C.createBufferSource(); s.buffer = buf || this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    return f;
  }
  tone(type, f0, f1, dur, gain, dest, t0 = 0, attack = 0.005) {
    const C = this.ctx, t = C.currentTime + t0; const o = C.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
  }
  _ambient() {
    const C = this.ctx;
    const amb = C.createGain(); amb.gain.value = 0.32; amb.connect(this.master); this.ambGain = amb;
    // гул шахты: коричневый шум через фильтры + медленные биения
    const b = C.createBufferSource(); b.buffer = this.brownBuf; b.loop = true;
    const bf = C.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 160;
    const bg = C.createGain(); bg.gain.value = 0.9; b.connect(bf).connect(bg).connect(amb); b.start();
    for (const f of [36.7, 37.3]) { const o = C.createOscillator(); o.frequency.value = f; const g = C.createGain(); g.gain.value = 0.12; o.connect(g).connect(amb); o.start(); }
    // воздух в шахте
    const n = C.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const nf = C.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 500; nf.Q.value = 0.5;
    const ng = C.createGain(); ng.gain.value = 0.05; n.connect(nf).connect(ng).connect(amb); n.connect(nf); n.start();
    const wl = C.createOscillator(); wl.frequency.value = 0.04; const wg = C.createGain(); wg.gain.value = 300; wl.connect(wg).connect(nf.frequency); wl.start();
    // напряжение — низкий кластер, нарастает рядом с ним
    this.tension = C.createGain(); this.tension.gain.value = 0;
    for (const f of [55, 58.3, 82.4, 87.3]) { const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; o.connect(lp).connect(this.tension); o.start(); }
    const hi = C.createOscillator(); hi.type = 'sine'; hi.frequency.value = 3520; const hg = C.createGain(); hg.gain.value = 0.015; hi.connect(hg).connect(this.tension); hi.start();
    this.tension.connect(this.master); this.tension.connect(this.verb);
  }
  _monsterLoop() {
    // дыхание + щелчки горла + шорох ткани, всё через один панорамер
    const C = this.ctx; const p = C.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.5; p.rolloffFactor = 1.6; p.maxDistance = 50;
    this.mPan = p; this.mGain = C.createGain(); this.mGain.gain.value = 0; this.mGain.connect(p); p.connect(this.master);
    const w = C.createGain(); w.gain.value = 0.9; p.connect(w).connect(this.verb);
    this.mOcc = C.createBiquadFilter(); this.mOcc.type = 'lowpass'; this.mOcc.frequency.value = 8000; this.mOcc.connect(this.mGain);
    // дыхание: шум через форманты, огибающая из медленного осциллятора
    const n = C.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f1 = C.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 700; f1.Q.value = 2;
    const f2 = C.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1500; f2.Q.value = 3;
    const env = C.createGain(); env.gain.value = 0;
    const lfo = C.createOscillator(); lfo.frequency.value = 0.45; const lg = C.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(env.gain); lfo.start();
    n.connect(f1).connect(env); n.connect(f2).connect(env); env.connect(this.mOcc); n.start();
    this.breathLfo = lfo;
    // шорох ткани при движении
    const sc = C.createBufferSource(); sc.buffer = this.noiseBuf; sc.loop = true;
    const sf = C.createBiquadFilter(); sf.type = 'highpass'; sf.frequency.value = 2500;
    this.rustle = C.createGain(); this.rustle.gain.value = 0; sc.connect(sf).connect(this.rustle).connect(this.mOcc); sc.start();
    this._clickT = 0;
  }
  // щелчки горлом — как трещотка
  throatClick(n = 6) {
    if (!this.ctx) return; const t0 = Math.random() * 0.05;
    for (let i = 0; i < n; i++) { const dt = t0 + i * (0.035 + Math.random() * 0.03); this.noise(0.02, 1800 + Math.random() * 600, 8, 0.9, this.mOcc, 'bandpass', dt); this.noise(0.03, 300, 4, 0.5, this.mOcc, 'bandpass', dt); }
  }
  updateMonster(pos, state, occluded, dist, dt) {
    if (!this.ctx) return; const t = this.t, p = this.mPan;
    p.positionX.setTargetAtTime(pos.x, t, 0.03); p.positionY.setTargetAtTime(1.7, t, 0.03); p.positionZ.setTargetAtTime(pos.z, t, 0.03);
    const vol = state === 'gone' ? 0 : state === 'chase' ? 1.4 : state === 'frozen' ? 0.35 : 0.8;
    this.mGain.gain.setTargetAtTime(vol, t, 0.15);
    this.mOcc.frequency.setTargetAtTime(occluded ? 600 : 8000, t, 0.2);
    this.breathLfo.frequency.setTargetAtTime(state === 'chase' ? 1.6 : 0.45, t, 0.3);
    this.rustle.gain.setTargetAtTime(state === 'chase' ? 0.35 : state === 'stalk' ? 0.08 : 0, t, 0.1);
    this._clickT -= dt;
    if (state !== 'gone' && this._clickT <= 0) { this._clickT = state === 'chase' ? 0.6 + Math.random() : 3 + Math.random() * 6; if (dist < 25) this.throatClick(4 + Math.floor(Math.random() * 8)); }
  }
  paper() { if (!this.ctx) return; const o = this.out(1, 0.2); for (let i = 0; i < 6; i++) this.noise(0.08 + Math.random() * 0.1, 2500 + Math.random() * 3000, 1, 0.15, o, 'bandpass', i * 0.07); }
  step(run, wet = false, vol = 1) { if (!this.ctx) return; const o = this.out(vol, 0.35 * vol); this.noise(run ? 0.12 : 0.16, run ? 700 : 450, 1.2, run ? 0.5 : 0.32, o); this.noise(0.06, 2400, 1.5, run ? 0.12 : 0.06, o, 'bandpass', 0.015); if (wet) this.noise(0.18, 1200, 3, 0.15, o, 'bandpass', 0.03); }
  click() { if (!this.ctx) return; const o = this.out(1, 0.15); this.noise(0.02, 3800, 3, 0.5, o, 'bandpass'); this.noise(0.03, 1400, 3, 0.3, o, 'bandpass', 0.045); }
  tick() { if (!this.ctx) return; this.noise(0.025, 2600, 4, 0.06, this.out(1, 0.15), 'bandpass'); }
  select() { if (!this.ctx) return; this.noise(0.09, 500, 3, 0.25, this.out(1, 0.6), 'bandpass'); }
  // металлический стук вместо «музыкального» звона
  pickup() {
    if (!this.ctx) return; const o = this.out(1, 0.6);
    for (const f of [1230, 2871, 4410]) this.tone('sine', f, f * 0.995, 0.35 + Math.random() * 0.3, 0.05, o, 0, 0.002);
    this.noise(0.05, 3000, 2, 0.3, o, 'bandpass');
  }
  battery() { if (!this.ctx) return; const o = this.out(1, 0.3); this.noise(0.03, 2500, 4, 0.4, o, 'bandpass'); this.noise(0.04, 900, 4, 0.3, o, 'bandpass', 0.08); }
  // резкий удар, когда он попадает в луч
  stinger() {
    if (!this.ctx) return; const o = this.out(1, 1.2);
    this.tone('sawtooth', 70, 30, 1.8, 0.6, o, 0, 0.01);
    this.noise(1.4, 3000, 0.7, 0.5, o, 'bandpass');
    for (const f of [1046, 1108, 1174, 1244]) this.tone('sawtooth', f, f * 0.97, 1.5, 0.035, o, 0, 0.01);
  }
  // скример: многослойный перегруженный вопль
  screech(len = 1.4) {
    if (!this.ctx) return; const C = this.ctx, t = C.currentTime; const d = this.dist; const o = this.out(0.9, 0.6);
    for (let i = 0; i < 6; i++) {
      const osc = C.createOscillator(); osc.type = i % 2 ? 'sawtooth' : 'square'; const f = 380 + i * 117 + Math.random() * 40;
      osc.frequency.setValueAtTime(f * 0.6, t); osc.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.12); osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + len);
      const vib = C.createOscillator(); vib.frequency.value = 23 + i * 9; const vg = C.createGain(); vg.gain.value = f * 0.12; vib.connect(vg).connect(osc.frequency); vib.start(t); vib.stop(t + len + 0.1);
      const fm = C.createBiquadFilter(); fm.type = 'bandpass'; fm.frequency.value = 900 + i * 400; fm.Q.value = 1.5;
      const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.setValueAtTime(0.22, t + len * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(fm).connect(g); g.connect(d); g.connect(o); osc.start(t); osc.stop(t + len + 0.1);
    }
    this.noise(len, 2500, 0.5, 0.9, d, 'bandpass');
    this.tone('sine', 55, 28, 1.2, 1.0, this.master, 0, 0.003);
    this.noise(0.25, 120, 1, 1.2, this.master);
  }
  // помехи после смерти
  static_(len = 2.5) { if (!this.ctx) return; this.noise(len, 4000, 0.3, 0.35, this.master, 'bandpass'); }
  // звуки в мире
  knock(pos, n = 3) { if (!this.ctx) return; for (let i = 0; i < n; i++) { const o = this.at(pos, 1.6, 1.2); this.tone('sine', 95, 50, 0.25, 0.9, o, i * 0.42, 0.002); this.noise(0.06, 900, 2, 0.6, o, 'bandpass', i * 0.42); } }
  bang(pos) { if (!this.ctx) return; const o = this.at(pos, 2, 1.5, 4); this.noise(1.6, 300, 1, 1.0, o); this.noise(0.4, 2000, 1, 0.5, o, 'bandpass'); for (const f of [180, 263, 341]) this.tone('triangle', f, f * 0.98, 2.2, 0.15, o, 0, 0.003); }
  distantScream(pos) {
    if (!this.ctx) return; const o = this.at(pos, 0.9, 2.5, 5); const C = this.ctx, t = C.currentTime;
    const osc = C.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(620, t); osc.frequency.linearRampToValueAtTime(880, t + 0.4); osc.frequency.exponentialRampToValueAtTime(300, t + 2.2);
    const vib = C.createOscillator(); vib.frequency.value = 6; const vg = C.createGain(); vg.gain.value = 25; vib.connect(vg).connect(osc.frequency); vib.start(t); vib.stop(t + 2.4);
    const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2;
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    osc.connect(f).connect(g).connect(o); osc.start(t); osc.stop(t + 2.4);
  }
  whisper(pos, len = 2.2) {
    if (!this.ctx) return; const o = this.at(pos, 1.2, 0.3, 1);
    for (let i = 0; i < 9; i++) { const dt = i * (len / 9) + Math.random() * 0.08; const f = 900 + Math.random() * 2600; this.noise(0.12 + Math.random() * 0.15, f, 6 + Math.random() * 6, 0.35, o, 'bandpass', dt); if (Math.random() < 0.4) this.noise(0.05, 5500, 3, 0.25, o, 'bandpass', dt + 0.05); }
  }
  runPast(pos) { if (!this.ctx) return; const o = this.at(pos, 1.4, 1, 3); for (let i = 0; i < 7; i++) { this.noise(0.08, 500, 1.5, 0.7, o, 'lowpass', i * 0.13); this.noise(0.12, 2600, 1, 0.12, o, 'highpass', i * 0.13); } }
  chainFall(pos) {
    if (!this.ctx) return; const o = this.at(pos, 1.8, 1.2, 2);
    for (let i = 0; i < 18; i++) this.noise(0.04, 3000 + Math.random() * 4000, 10, 0.35, o, 'bandpass', i * 0.022 + Math.random() * 0.02);
    this.tone('sine', 70, 35, 0.5, 1.2, o, 0.45, 0.002); this.noise(0.4, 250, 1, 1.1, o, 'lowpass', 0.45);
    for (let i = 0; i < 8; i++) this.noise(0.05, 4000, 8, 0.2, o, 'bandpass', 0.5 + i * 0.05);
  }
  buzz(pos, len = 1) { if (!this.ctx) return; const o = this.at(pos, 0.5, 0.4, 1.5); const s = this.tone('sawtooth', 100, 100, len, 0.25, o, 0, 0.01); const f = this.ctx.createBiquadFilter(); }
  pop(pos) { if (!this.ctx) return; const o = this.at(pos, 1.5, 1, 2); this.noise(0.08, 3000, 1, 1, o, 'highpass'); for (let i = 0; i < 10; i++) this.tone('sine', 3000 + Math.random() * 5000, 2500, 0.15, 0.05, o, 0.02 + i * 0.03, 0.001); }
  creak(pos) {
    if (!this.ctx) return; const o = pos ? this.at(pos, 1, 0.8) : this.out(1, 0.7); const C = this.ctx, t = C.currentTime;
    const osc = C.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(65, t); osc.frequency.linearRampToValueAtTime(95, t + 0.7);
    const am = C.createOscillator(); am.frequency.value = 33; const amg = C.createGain(); amg.gain.value = 0.5; am.connect(amg);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8); amg.connect(g.gain);
    const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 3;
    osc.connect(f).connect(g).connect(o); osc.start(t); am.start(t); osc.stop(t + 0.9); am.stop(t + 0.9);
  }
  drip(pos) { if (!this.ctx) return; const o = this.at(pos, 0.5, 1.4, 1); const f = 1000 + Math.random() * 1500; this.tone('sine', f, f * 0.45, 0.12, 0.25, o, 0, 0.002); }
  lift() { if (!this.ctx) return; const o = this.out(1, 1); this.noise(3.5, 180, 4, 0.7, o); this.creak(); this.tone('sawtooth', 48, 52, 3.5, 0.12, o, 0, 0.6); }
  liftUp() { if (!this.ctx) return; const o = this.out(1, 0.8); this.tone('sawtooth', 45, 90, 6, 0.15, o, 0, 1.5); this.noise(6, 200, 2, 0.4, o, 'lowpass', 0); }
  intro() { if (!this.ctx) return; const o = this.out(1, 1.2); this.noise(2.5, 200, 1, 1.0, o); this.tone('triangle', 120, 40, 2.5, 0.3, o, 0, 0.003); for (let i = 0; i < 20; i++) this.noise(0.05, 2000 + Math.random() * 4000, 6, 0.2, o, 'bandpass', 0.1 + Math.random() * 1.2); }
  breath(gain) { if (!this.ctx) return; const o = this.out(gain, 0.1); this.noise(0.5, 900, 1.5, 0.4, o, 'bandpass'); this.noise(0.6, 600, 1.5, 0.3, o, 'bandpass', 0.6); }
  update(dt, fear, playerTired) {
    if (!this.ctx) return; const t = this.t;
    this.tension.gain.setTargetAtTime(Math.max(0, fear - 0.15) * 0.06, t, 0.4);
    const bpm = 58 + fear * 95; this._heartT -= dt;
    if (fear > 0.25 && this._heartT <= 0) {
      this._heartT = 60 / bpm; const v = 0.2 + fear * 0.6;
      for (const [d, k] of [[0, 1], [0.15, 0.65]]) this.tone('sine', 62, 38, 0.18, v * k, this.master, d, 0.008);
    }
    this._breathT = (this._breathT || 0) - dt;
    if (playerTired && this._breathT <= 0) { this._breathT = 1.3; this.breath(0.6); }
  }
}
