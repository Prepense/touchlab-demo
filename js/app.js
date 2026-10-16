import { randomCode, validRoom } from './protocol.js';
import { TouchLabSession } from './session.js';
import { ScreenAwake } from './screen-awake.js';

const $ = id => document.getElementById(id);
const chosenRole = () => document.querySelector('input[name="role"]:checked').value;
const now = () => new Date().toLocaleTimeString('th-TH', { hour12: false });
const counts = { P1: 0, P2: 0, P3: 0 };
let refreshes = 0, activePoint = '', logLines = [];
function log(message) {
  logLines.unshift(`[${now()}] ${message}`);
  logLines = logLines.slice(0, 60);
  $('log').textContent = logLines.join('\n');
}
function badge(id, message, state = '') {
  const element = $(id), dot = document.createElement('span');
  dot.className = 'dot'; element.className = `badge ${state}`;
  element.replaceChildren(dot, document.createTextNode(message));
}
function drawTargets() {
  for (const point of ['P1', 'P2', 'P3']) {
    const element = $('point' + point), count = document.createElement('span');
    element.className = 'target' + (activePoint === point ? ' active' : '');
    count.textContent = `${counts[point]} ครั้ง`;
    element.replaceChildren(document.createTextNode(point), count);
  }
  $('refreshCount').textContent = `Refresh จำลอง: ${refreshes}`;
}
function applyCommand({ point }) {
  if (point === 'REFRESH') {
    refreshes++; activePoint = '';
    for (const key of Object.keys(counts)) counts[key] = 0;
  } else if (point === 'CLEAR') activePoint = '';
  else { counts[point]++; activePoint = point; }
  drawTargets();
  $('slaveResult').textContent = `จำลอง ${point === 'REFRESH' ? 'รีเซ็ตตัวนับและจุดเลือก' : point === 'CLEAR' ? 'ล้างจุดเลือก' : 'เลือกจุด ' + point} · ${now()}`;
}
function result(data) {
  const messages = {
    waiting: `ส่ง ${data.point} (จำลอง) · รอ ACK · ${data.id}`,
    ack: `Command ACK · ${data.point} · ${data.elapsed} ms (simulated — จำลองเท่านั้น) · ${data.id}`,
    timeout: `Timeout · ${data.point} · ไม่มี ACK ภายใน 8 วินาที — ไม่ทราบผลจำลอง · ${data.id}`,
    cancelled: `${data.reason} · ${data.point} · ${data.id}`
  };
  $('hostResult').textContent = messages[data.kind];
}
const session = new TouchLabSession({
  connectMqtt: (...args) => {
    if (typeof window.mqtt?.connect !== 'function') throw new Error('โหลด MQTT.js ไม่สำเร็จ — ตรวจอินเทอร์เน็ต/CDN แล้วลองใหม่หรือโหลดหน้าใหม่');
    return window.mqtt.connect(...args);
  },
  emit(type, data) {
    if (type === 'state') render();
    else if (type === 'log') log(data);
    else if (type === 'result') result(data);
    else if (type === 'command') applyCommand(data);
  }
});
const screenAwake = new ScreenAwake({
  request: window.isSecureContext && typeof navigator.wakeLock?.request === 'function'
    ? () => navigator.wakeLock.request('screen') : undefined,
  visible: () => !document.hidden,
  emit({ supported, active, wanted, busy, error }) {
    const button = $('keepAwake');
    if (!button || !$('awakeStatus')) return; // Cached pre-1.2 HTML can still use the command demo.
    button.disabled = !supported || busy;
    button.textContent = busy ? 'กำลังดำเนินการ…' : active ? 'ปิดการเปิดหน้าจอค้าง' : 'เปิดหน้าจอค้าง';
    button.setAttribute('aria-pressed', String(active));
    $('awakeStatus').textContent = error || (!supported ? 'เบราว์เซอร์นี้ไม่รองรับ — ลองใช้ Chrome รุ่นปัจจุบันบน Android ผ่าน HTTPS'
      : active ? 'เปิดหน้าจอค้างอยู่ · เปิดหน้า TouchLab ไว้ด้านหน้า'
      : wanted ? 'หน้าจอค้างถูกพักหรือระบบยกเลิก · กลับมาหน้านี้แล้วกดเปิดอีกครั้งได้'
      : 'ยังไม่เปิด · กดเมื่อต้องการให้หน้าจอไม่ดับระหว่างทดสอบ');
  }
});
if ($('keepAwake')) $('keepAwake').onclick = () => { if (screenAwake.active) void screenAwake.disable(); else void screenAwake.enable(); };
screenAwake.changed();
const labels = {
  disconnected: 'Disconnected · ยังไม่เชื่อมต่อ', connecting: 'กำลังเชื่อมต่อ Broker',
  subscribing: 'Broker เชื่อมแล้ว · รอ Subscribe', ready: 'Connected to broker',
  reconnecting: 'Disconnected · กำลังเชื่อมใหม่', suspended: 'พักหน้าเว็บ · Disconnected',
  error: 'เชื่อมต่อผิดพลาด · ดูบันทึกเหตุการณ์'
};
function render() {
  const { state, online, pending } = session.snapshot();
  const active = !['disconnected', 'error'].includes(state);
  const role = active ? session.role : chosenRole();
  $('setupCard').querySelectorAll('input[name="role"],#room,#newRoom').forEach(element => { element.disabled = active; });
  $('connect').hidden = active; $('disconnect').hidden = !active;
  $('hostPanel').hidden = role !== 'host'; $('slavePanel').hidden = role !== 'slave';
  $('roleLabel').textContent = role === 'host' ? 'iPhone · Host' : 'Android · Slave';
  badge('brokerBadge', labels[state], state === 'ready' ? 'good' : ['error', 'reconnecting'].includes(state) ? 'bad' : '');
  badge('deviceBadge', role === 'host' ? (online ? 'Slave online · Android Online' : 'Slave offline · Android Offline')
    : state === 'ready' ? 'พร้อมรับคำสั่งจำลอง' : 'ยังไม่พร้อมรับคำสั่ง', (role === 'host' ? online : state === 'ready') ? 'good' : 'bad');
  $('info').textContent = active ? `Room: ${session.room} · ${pending ? 'กำลังรอ ACK จำลอง' : 'เปิดหน้าจอและหน้าเว็บค้างไว้'}` : 'เลือกโหมดและเชื่อมต่อ';
  document.querySelectorAll('[data-cmd]').forEach(button => { button.disabled = !session.canSend || document.hidden; });
  $('connectionHint').textContent = state === 'error' ? 'เชื่อมต่อไม่สำเร็จ: ดูบันทึกด้านล่าง ตรวจเครือข่าย/CDN/Broker แล้วลองใหม่'
    : document.hidden ? 'หน้าเว็บอยู่เบื้องหลัง — พักการส่งคำสั่ง' : 'คำสั่งและ ACK ทั้งหมดเป็นการจำลองบนหน้า TouchLab เท่านั้น';
}
const roomParam = new URLSearchParams(location.search).get('room')?.toUpperCase();
$('room').value = validRoom(roomParam) ? roomParam : randomCode();
$('newRoom').onclick = () => { $('room').value = randomCode(); };
$('connect').onclick = () => {
  const room = $('room').value.trim().toUpperCase(); $('room').value = room;
  if (!validRoom(room)) { log('กรุณาใส่รหัสห้อง A–Z, 0–9 หรือ - ความยาว 6–22 ตัว'); $('room').focus(); return; }
  $('hostResult').textContent = 'รอ Slave online ก่อนส่งคำสั่งจำลอง';
  session.connect(chosenRole(), room);
};
$('disconnect').onclick = () => session.disconnect();
document.querySelectorAll('input[name="role"]').forEach(input => input.addEventListener('change', render));
document.querySelectorAll('[data-cmd]').forEach(button => { button.onclick = () => { if (!document.hidden) session.send(button.dataset.cmd); }; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { session.suspend(); void screenAwake.pause(); }
  else { session.resume(); void screenAwake.resume(); }
  render();
});
window.addEventListener('pagehide', () => { session.suspend(); void screenAwake.pause(); });
window.addEventListener('pageshow', () => { if (!document.hidden) { session.resume(); void screenAwake.resume(); } });
window.addEventListener('offline', () => { log('เบราว์เซอร์รายงานว่าเครือข่าย offline'); session.suspend(); });
window.addEventListener('online', () => { log('เครือข่ายกลับมา — รอ Presence ใหม่ก่อนส่งคำสั่ง'); if (!document.hidden) session.resume(); });
render(); drawTargets();
if (!window.mqtt) {
  log('กำลังโหลด MQTT.js จาก CDN; ถ้าเชื่อมต่อไม่ได้ให้ตรวจอินเทอร์เน็ต/CDN');
  const deadline = setTimeout(() => { if (!window.mqtt) log('โหลด MQTT.js ไม่สำเร็จภายใน 12 วินาที — ตรวจ CDN แล้วโหลดหน้าใหม่'); }, 12000);
  $('mqttScript').addEventListener('load', () => {
    clearTimeout(deadline);
    log(typeof window.mqtt?.connect === 'function' ? 'โหลด MQTT.js สำเร็จ — พร้อมเชื่อมต่อ Demo Broker'
      : 'โหลด MQTT.js ไม่สำเร็จ — CDN ไม่ได้ให้ SDK ที่พร้อมใช้งาน');
  });
  $('mqttScript').addEventListener('error', () => { clearTimeout(deadline); log('โหลด MQTT.js ไม่สำเร็จ — ตรวจอินเทอร์เน็ต/CDN แล้วโหลดหน้าใหม่'); });
}
if (location.protocol === 'file:') log('โปรดเปิดผ่าน HTTP localhost หรือ HTTPS; ES modules ใช้ file:// ไม่ได้');
