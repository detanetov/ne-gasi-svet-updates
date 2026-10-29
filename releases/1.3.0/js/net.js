// Сеть: комнаты по коду через интернет (Supabase Realtime) или по IP / локальной сети
export const NET_CONFIG = {
  // Сервер-ретранслятор для игры через интернет (бесплатный проект Supabase)
  realtimeUrl: 'wss://vncmvauhqwdrhdxolape.supabase.co/realtime/v1/websocket',
  apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuY212YXVocXdkcmhkeG9sYXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4MTA1NDcsImV4cCI6MjEwODM4NjU0N30.sUC04TKr_4Sy8sOhGW02E90NLJPZDuMG9bntryWsei4'
};

// Базовый интерфейс: send(obj), onmsg(obj), onclose()
class Base {
  constructor() { this.onmsg = () => {}; this.onclose = () => {}; this.open = false; }
}

export class RealtimeNet extends Base {
  constructor(code, url = NET_CONFIG.realtimeUrl, key = NET_CONFIG.apiKey) {
    super(); this.code = code; this.url = url; this.key = key; this.ref = 1; this.topic = 'realtime:ngs-' + code.toLowerCase();
  }
  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = this.ws = new WebSocket(`${this.url}?apikey=${encodeURIComponent(this.key)}&vsn=1.0.0`);
      const fail = (e) => { if (!settled) { settled = true; reject(new Error(e)); } };
      const to = setTimeout(() => fail('Сервер не отвечает'), 9000);
      ws.onopen = () => {
        this.joinRef = String(this.ref++);
        ws.send(JSON.stringify({
          topic: this.topic, event: 'phx_join', ref: this.joinRef, join_ref: this.joinRef,
          payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [], private: false }, access_token: this.key }
        }));
      };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.event === 'phx_reply' && m.ref === this.joinRef) {
          clearTimeout(to);
          if (m.payload && m.payload.status === 'ok') {
            this.open = true; settled = true; resolve();
            this.hb = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(this.ref++) })); }, 25000);
          } else fail('Не удалось войти в комнату');
          return;
        }
        if (m.event === 'broadcast' && m.payload && m.payload.payload) this.onmsg(m.payload.payload);
        if (m.event === 'phx_error' || m.event === 'phx_close') { if (this.open) { this.open = false; this.onclose(); } }
      };
      ws.onerror = () => fail('Нет подключения к интернету или сервер недоступен');
      ws.onclose = () => { clearTimeout(to); clearInterval(this.hb); if (this.open) { this.open = false; this.onclose(); } fail('Соединение закрыто'); };
    });
  }
  send(obj) {
    if (!this.open || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ topic: this.topic, event: 'broadcast', ref: String(this.ref++), join_ref: this.joinRef, payload: { type: 'broadcast', event: 'g', payload: obj } }));
  }
  close() { this.open = false; clearInterval(this.hb); try { this.ws.close(); } catch (e) {} }
}

export class LanNet extends Base {
  constructor(hostAddr) { super(); this.hostAddr = hostAddr; }
  async connect() {
    const N = window.native;
    if (!N) throw new Error('Игра по IP работает только в .exe версии');
    if (!LanNet._bound) {
      LanNet._bound = true;
      N.onLanMsg((line) => { try { LanNet.active && LanNet.active.onmsg(JSON.parse(line)); } catch (e) {} });
      N.onLanClosed(() => { if (LanNet.active) { LanNet.active.open = false; LanNet.active.onclose(); } });
    }
    LanNet.active = this;
    const r = this.hostAddr ? await N.lanJoin(this.hostAddr) : await N.lanHost();
    if (!r.ok) throw new Error(r.error || 'Ошибка сети');
    this.info = r; this.open = true;
  }
  send(obj) { if (this.open) window.native.lanSend(JSON.stringify(obj)); }
  close() { this.open = false; if (window.native) window.native.lanStop(); if (LanNet.active === this) LanNet.active = null; }
}

// Для теста в одном браузере (несколько вкладок)
export class LocalNet extends Base {
  constructor(code) { super(); this.code = code; }
  async connect() { this.bc = new BroadcastChannel('ngs-' + this.code); this.bc.onmessage = (e) => this.onmsg(e.data); this.open = true; }
  send(obj) { if (this.open) this.bc.postMessage(obj); }
  close() { this.open = false; this.bc.close(); }
}
