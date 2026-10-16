// Public demo only. Room names are not authentication. Never add private credentials here.
export const CONFIG = Object.freeze({
  broker: 'wss://broker.emqx.io:8084/mqtt',
  prefix: 'touchlab/v1',
  heartbeatMs: 5000,
  presenceTtlMs: 15000,
  commandTtlMs: 30000,
  ackTimeoutMs: 8000,
  retryMs: 3000,
  maxRetries: 1,
  commandIntervalMs: 500,
  connectTimeoutMs: 12000,
  reconnectMs: 3500,
  dedupTtlMs: 65000,
  maxSeen: 1000,
  maxPayloadBytes: 2048
});
