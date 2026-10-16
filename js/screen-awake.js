// Screen Wake Lock only: an opt-in for this visible page, independent of MQTT.
export class ScreenAwake {
  constructor({ request, visible = () => true, emit = () => {} } = {}) {
    Object.assign(this, { request, visible, emit });
    this.wanted = false;
    this.lock = null;
    this.busy = false;
    this.generation = 0;
    this.error = '';
    this.paused = false;
  }
  get supported() { return typeof this.request === 'function'; }
  get active() { return !!this.lock && !this.lock.released; }
  snapshot() { return { supported: this.supported, active: this.active, wanted: this.wanted, busy: this.busy, error: this.error }; }
  changed() { this.emit(this.snapshot()); }
  async enable() {
    if (!this.supported) { this.error = 'เบราว์เซอร์นี้ไม่รองรับการเปิดหน้าจอค้าง'; this.changed(); return false; }
    this.wanted = true;
    if (this.busy || this.active) return this.active;
    if (this.paused || !this.visible()) { this.changed(); return false; }
    const generation = ++this.generation;
    this.busy = true; this.error = ''; this.changed();
    try {
      const lock = await this.request();
      if (generation !== this.generation || !this.wanted || this.paused || !this.visible()) {
        await lock.release(); return false;
      }
      if (lock.released) throw new Error('Wake lock was already released');
      this.lock = lock;
      lock.addEventListener('release', () => {
        if (this.lock !== lock) return;
        this.lock = null;
        this.changed(); // Do not spin in a retry loop if the OS revokes the lock.
      });
      return true;
    } catch {
      if (generation === this.generation) this.error = 'เปิดหน้าจอค้างไม่ได้ — ตรวจโหมดประหยัดพลังงาน/แบตเตอรี่ แล้วกดลองอีกครั้ง';
      return false;
    } finally {
      if (generation === this.generation) { this.busy = false; this.changed(); }
    }
  }
  async release(preserveIntent = false) {
    if (!preserveIntent) this.wanted = false;
    const generation = ++this.generation, lock = this.lock;
    this.busy = !!lock && !lock.released;
    this.error = ''; this.changed();
    try {
      if (lock && !lock.released) await lock.release();
      if (this.lock === lock) this.lock = null;
    } catch {
      if (generation === this.generation) this.error = 'ยังปิดการเปิดหน้าจอค้างไม่ได้ — กดปิดอีกครั้งหรือปิดแท็บ';
    } finally {
      if (generation === this.generation) {
        this.busy = false; this.changed();
        // Handle a fast hide/show while the old sentinel was being released.
        if (preserveIntent && this.wanted && !this.paused && this.visible() && !this.active && !this.error) void this.enable();
      }
    }
  }
  pause() { this.paused = true; return this.release(true); }
  resume() { this.paused = false; return this.wanted ? this.enable() : Promise.resolve(false); }
  disable() { return this.release(false); }
}
