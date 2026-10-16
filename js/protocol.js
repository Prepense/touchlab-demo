import { CONFIG } from './config.js';

export const COMMANDS = Object.freeze(['P1', 'P2', 'P3', 'CLEAR', 'REFRESH']);
export const validRoom = room => typeof room === 'string' && /^[A-Z0-9-]{6,22}$/.test(room);
const validId = id => typeof id === 'string' && /^[-A-Za-z0-9]{8,50}$/.test(id);
export const fresh = (when, now, ttl) => Number.isSafeInteger(when) && when > 0 && Math.abs(now - when) < ttl;
export function randomCode(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, x => chars[x % chars.length]).join('');
}
export function parsePayload(raw) {
  if (raw == null || (typeof raw !== 'string' && typeof raw.toString !== 'function')) return null;
  if (raw.byteLength > CONFIG.maxPayloadBytes || raw.length > CONFIG.maxPayloadBytes) return null;
  const text = raw.toString();
  if (new TextEncoder().encode(text).length > CONFIG.maxPayloadBytes) return null;
  try {
    const data = JSON.parse(text);
    return data && !Array.isArray(data) && data.v === 1 ? data : null;
  } catch { return null; }
}
export function validCommand(data, now) {
  return !!data && data.v === 1 && validId(data.id) && COMMANDS.includes(data.point)
    && fresh(data.when, now, CONFIG.commandTtlMs);
}
export function validAck(data, command, now) {
  return !!data && validCommand(data, now) && data.status === 'simulated'
    && data.id === command.id && data.point === command.point;
}
export function validPresence(data, now) {
  return !!data && data.v === 1 && data.type === 'demo'
    && fresh(data.when, now, CONFIG.presenceTtlMs);
}

// Never clear the entire cache: reject new commands if all slots are still live.
export class DuplicateGuard {
  constructor() { this.entries = new Map(); }
  prune(now) {
    for (const [id, entry] of this.entries) if (now - entry.savedAt >= CONFIG.dedupTtlMs) this.entries.delete(id);
  }
  get(id, now) { this.prune(now); return this.entries.get(id); }
  remember(command, ack, now) {
    this.prune(now);
    if (this.entries.size >= CONFIG.maxSeen) return false;
    this.entries.set(command.id, { command, ack, savedAt: now });
    return true;
  }
}
