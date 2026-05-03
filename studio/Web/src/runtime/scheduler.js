// PollScheduler — runs prioritized read tasks against a single device.
// - Reads "fast" tasks at fastPeriodMs (default 50ms ≈ 20 Hz).
// - Reads "slow" tasks at slowPeriodMs (default 500ms = 2 Hz).
// - Single in-flight per task (the AvlosClient queue already enforces
//   global ordering on the wire).
// - pause()/resume() let the UI freeze polling during destructive
//   operations such as calibration.
export class PollScheduler {
  constructor({ fastPeriodMs = 50, slowPeriodMs = 500 } = {}) {
    this.fast = [];
    this.slow = [];
    this._fastT = null;
    this._slowT = null;
    this._fastPeriod = fastPeriodMs;
    this._slowPeriod = slowPeriodMs;
    this._paused = false;
    this._running = false;
  }
  setFastPeriod(ms) { this._fastPeriod = Math.max(20, ms); }
  setSlowPeriod(ms) { this._slowPeriod = Math.max(100, ms); }

  add({ kind, run }) {
    const list = kind === 'slow' ? this.slow : this.fast;
    list.push({ run, busy: false });
  }
  reset() { this.fast = []; this.slow = []; }

  start() {
    if (this._running) return;
    this._running = true;
    this._fastT = setInterval(() => this._tick(this.fast), this._fastPeriod);
    this._slowT = setInterval(() => this._tick(this.slow), this._slowPeriod);
  }
  stop() {
    this._running = false;
    clearInterval(this._fastT); this._fastT = null;
    clearInterval(this._slowT); this._slowT = null;
  }
  pause() { this._paused = true; }
  resume() { this._paused = false; }

  async _tick(tasks) {
    if (this._paused) return;
    for (const t of tasks) {
      if (t.busy) continue;
      t.busy = true;
      Promise.resolve(t.run())
        .catch(e => console.debug('poll task error', e))
        .finally(() => { t.busy = false; });
    }
  }
}
