import { CONFIG } from './config.js';
import { COMMANDS, DuplicateGuard, parsePayload, randomCode, validAck, validCommand, validPresence, validRoom } from './protocol.js';

// MQTT transport and command lifecycle. No DOM; clock, transport and IDs are injectable for tests.
export class TouchLabSession {
  constructor({ connectMqtt, emit = () => {}, now = () => Date.now(), id = () => randomCode(16), timers = globalThis }) {
    Object.assign(this, { connectMqtt, emit, now, id, timers });
    this.state = 'disconnected';
    this.role = 'host';
    this.room = '';
    this.client = null;
    this.pending = null;
    this.lastBeat = null;
    this.lastPresenceWhen = 0;
    this.caches = new Map();
    this.loop = null;
    this.deadline = null;
    this.linkEpoch = 0;
    this.reconnectTimer = null;
    this.lastSent = -Infinity;
  }
  get online() {
    const age = this.now() - this.lastBeat;
    return this.state === 'ready' && this.lastBeat !== null && age >= 0 && age < CONFIG.presenceTtlMs;
  }
  get canSend() { return this.role === 'host' && this.online && !this.pending && this.now() - this.lastSent >= CONFIG.commandIntervalMs; }
  snapshot() { return { state: this.state, role: this.role, room: this.room, online: this.online, pending: !!this.pending }; }
  changed() { this.emit('state', this.snapshot()); }
  log(text) { this.emit('log', text); }
  clearDeadline() { if (this.deadline !== null) this.timers.clearTimeout(this.deadline); this.deadline = null; }
  armDeadline(client) {
    this.clearDeadline();
    this.deadline = this.timers.setTimeout(() => {
      if (this.client === client && this.state !== 'ready') this.fail('เชื่อมต่อหรือ Subscribe ไม่สำเร็จภายใน 12 วินาที');
    }, CONFIG.connectTimeoutMs);
  }
  cancelPending(reason) {
    if (!this.pending) return;
    const { command } = this.pending;
    this.pending = null;
    this.emit('result', { kind: 'cancelled', point: command.point, id: command.id, reason });
  }
  resetPresence() { this.lastBeat = null; this.lastPresenceWhen = 0; }
  stop(state, reason) {
    const old = this.client;
    this.client = null; // Ignore all callbacks from the previous transport.
    this.linkEpoch++;
    this.clearDeadline();
    if (this.reconnectTimer !== null) this.timers.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.loop !== null) this.timers.clearInterval(this.loop);
    this.loop = null;
    this.resetPresence();
    this.state = state;
    this.cancelPending(reason);
    try { old?.end(true); } catch { this.log('ปิด transport ไม่สมบูรณ์'); }
    this.changed();
  }
  fail(reason) { this.stop('error', reason); this.log(reason); }
  disconnect() { this.stop('disconnected', 'ตัดการเชื่อมต่อ — ไม่ทราบผลคำสั่งจำลองที่ค้าง'); this.log('Disconnected'); }
  suspend() {
    if (!this.client && this.reconnectTimer === null) return;
    this.stop('suspended', 'หน้าเว็บถูกพัก — ไม่ทราบผลคำสั่งจำลองที่ค้าง');
    this.log('พักการเชื่อมต่อเมื่อหน้าเว็บอยู่เบื้องหลัง; กลับมาหน้าเว็บเพื่อเชื่อมใหม่');
  }
  resume() { if (this.state === 'suspended') this.connect(this.role, this.room); }
  connect(role, room) {
    if (!['host', 'slave'].includes(role) || !validRoom(room)) { this.log('รหัสห้องต้องเป็น A–Z, 0–9 หรือ - จำนวน 6–22 ตัว'); return false; }
    this.stop('disconnected', 'เริ่ม session ใหม่ — ไม่ทราบผลคำสั่งจำลองที่ค้าง');
    this.role = role; this.room = room;
    if (typeof this.connectMqtt !== 'function') { this.fail('โหลด MQTT.js ไม่สำเร็จ — ตรวจอินเทอร์เน็ต/CDN แล้วโหลดหน้าใหม่'); return false; }
    this.state = 'connecting';
    try {
      const client = this.connectMqtt(CONFIG.broker, {
        clientId: 'touchlab-' + this.id(), clean: true, resubscribe: false,
        queueQoSZero: false, reconnectPeriod: 0,
        connectTimeout: CONFIG.connectTimeoutMs, keepalive: 30, protocolVersion: 4
      });
      this.client = client;
      const current = fn => (...args) => { if (this.client === client) fn(...args); };
      client.on('connect', current(() => this.subscribe(client)));
      client.on('message', current((topic, raw, packet) => this.receive(topic, raw, packet)));
      const lost = () => {
        // A fresh MQTT client discards the old QoS outgoing queue, so cancelled
        // commands cannot be replayed automatically after a network change.
        this.stop('reconnecting', 'เครือข่ายหลุด — ไม่ทราบผลคำสั่งจำลองที่ค้าง');
        this.reconnectTimer = this.timers.setTimeout(() => this.connect(this.role, this.room), CONFIG.reconnectMs);
        this.log('Broker offline — รอเชื่อมใหม่ด้วย session ใหม่');
      };
      client.on('offline', current(lost));
      client.on('close', current(lost));
      client.on('error', current(error => { this.log('MQTT error: ' + error.message); lost(); }));
      this.armDeadline(client);
      this.nextPresence = this.now();
      this.loop = this.timers.setInterval(() => this.tick(), 250);
      this.log(`กำลังเชื่อมต่อ Broker · ${room} · ${role}`);
      this.changed();
      return true;
    } catch (error) { this.fail('เริ่ม MQTT ไม่ได้: ' + error.message); return false; }
  }
  topic(suffix) { return `${CONFIG.prefix}/${this.room}/${suffix}`; }
  subscribe(client) {
    this.state = 'subscribing'; this.resetPresence();
    this.armDeadline(client);
    const epoch = ++this.linkEpoch;
    const topics = (this.role === 'host' ? ['presence', 'ack'] : ['cmd']).map(s => this.topic(s));
    this.changed();
    try {
      client.subscribe(topics, { qos: 1 }, (error, granted) => {
        if (this.client !== client || this.linkEpoch !== epoch || this.state !== 'subscribing') return;
        if (error || !Array.isArray(granted) || !topics.every(topic => granted.some(g => g.topic === topic && [0, 1, 2].includes(g.qos)))) {
          this.fail('Subscribe ถูกปฏิเสธหรือไม่ครบ — ตรวจ Broker แล้วเชื่อมต่อใหม่'); return;
        }
        this.clearDeadline(); this.state = 'ready';
        this.log('Connected to broker · Subscribe สำเร็จ');
        if (this.role === 'slave') this.presence();
        this.changed();
      });
    } catch (error) { this.fail('Subscribe error: ' + error.message); }
  }
  publish(suffix, data, onError = () => {}) {
    if (!this.client || this.state !== 'ready') return false;
    const client = this.client, epoch = this.linkEpoch;
    try {
      client.publish(this.topic(suffix), JSON.stringify(data), { qos: 1, retain: false }, error => {
        if (this.client !== client || this.linkEpoch !== epoch) return;
        if (error) { this.log(`Publish ${suffix} ผิดพลาด: ${error.message}`); onError(error); }
      });
      return true;
    } catch (error) { this.log(`Publish ${suffix} ผิดพลาด: ${error.message}`); onError(error); return false; }
  }
  presence() {
    this.publish('presence', { v: 1, when: this.now(), type: 'demo' });
    this.nextPresence = this.now() + CONFIG.heartbeatMs;
  }
  send(point) {
    if (!this.canSend || !COMMANDS.includes(point)) return false;
    const time = this.now();
    this.lastSent = time;
    const command = { v: 1, id: `${this.id()}-${time}`, point, when: time };
    this.pending = { command, time, retries: 0 };
    this.emit('result', { kind: 'waiting', point, id: command.id });
    this.changed();
    this.log(`SEND จำลอง ${point} · ${command.id}`);
    return this.publishCommand(command);
  }
  publishCommand(command) {
    return this.publish('cmd', command, () => {
      if (this.pending?.command.id !== command.id) return;
      this.cancelPending('Publish ผิดพลาด — ไม่ทราบผลคำสั่งจำลอง'); this.changed();
    });
  }
  receive(topic, raw, packet = {}) {
    if (this.state !== 'ready' || packet.retain) return;
    const data = parsePayload(raw), time = this.now();
    if (this.role === 'host') {
      if (topic === this.topic('presence')) {
        if (!validPresence(data, time) || data.when <= this.lastPresenceWhen) return;
        this.lastPresenceWhen = data.when;
        // An already old heartbeat must not gain a new full lease on arrival.
        this.lastBeat = time - Math.max(0, time - data.when);
        this.changed(); return;
      }
      if (topic !== this.topic('ack') || !this.pending) return;
      if (time - this.pending.time >= CONFIG.ackTimeoutMs) { this.tick(); return; }
      if (!validAck(data, this.pending.command, time)) { this.log('ละทิ้ง ACK ไม่ถูกต้อง (ID/point/status/เวลา)'); return; }
      const elapsed = time - this.pending.time;
      this.pending = null;
      this.emit('result', { kind: 'ack', point: data.point, id: data.id, elapsed });
      this.log(`ACK simulated ${data.point} · ${data.id} · ${elapsed} ms`);
      this.changed();
    } else if (topic === this.topic('cmd')) {
      if (!validCommand(data, time)) { this.log('ละทิ้งคำสั่งจำลองไม่ถูกต้องหรือหมดอายุ'); return; }
      if (!this.caches.has(this.room)) this.caches.set(this.room, new DuplicateGuard());
      const guard = this.caches.get(this.room), previous = guard.get(data.id, time);
      if (previous) {
        if (previous.command.point === data.point && previous.command.when === data.when) {
          if (previous.ack) {
            this.publish('ack', previous.ack); this.log(`Duplicate ${data.id} · ส่ง ACK จำลองเดิมอีกครั้ง`);
          }
        } else this.log('ละทิ้ง ID ซ้ำที่ payload ไม่ตรงเดิม');
        return;
      }
      const ack = { v: 1, id: data.id, point: data.point, when: time, status: 'simulated' };
      if (!guard.remember(data, null, time)) { this.log('Duplicate cache เต็ม — ปฏิเสธคำสั่งใหม่ชั่วคราว'); return; }
      try { this.emit('command', data); }
      catch { this.log('ประมวลผล Demo ผิดพลาด — ไม่ส่ง ACK'); return; }
      guard.get(data.id, time).ack = ack;
      this.log(`DEMO จำลอง ${data.point} · ${data.id}`);
      this.publish('ack', ack);
    }
  }
  tick() {
    const time = this.now();
    if (this.state === 'ready' && this.role === 'slave' && time >= this.nextPresence) this.presence();
    const pending = this.pending;
    if (pending) {
      const elapsed = time - pending.time;
      if (elapsed >= CONFIG.ackTimeoutMs || elapsed < 0) {
        this.pending = null;
        this.emit('result', { kind: 'timeout', point: pending.command.point, id: pending.command.id });
        this.log(`TIMEOUT ${pending.command.point} · ไม่ทราบผลจำลอง; ไม่มี ACK ภายใน 8 วินาที`);
      } else if (this.canRetry(pending, elapsed)) {
        pending.retries++;
        this.log(`RETRY จำลอง ${pending.command.point} · ID เดิม ${pending.command.id}`);
        this.publishCommand(pending.command);
      }
    }
    for (const [room, cache] of this.caches) {
      cache.prune(time);
      if (!cache.entries.size) this.caches.delete(room);
    }
    this.changed();
  }
  canRetry(pending, elapsed) {
    return this.online && elapsed >= CONFIG.retryMs && pending.retries < CONFIG.maxRetries;
  }
}
