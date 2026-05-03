// Multi-device tile-view runtime. Maintains one <tm-device-tile> +
// AvlosClient per discovered Tinymovr, fed by a shared PollScheduler.
// Designed for at-a-glance fleet monitoring; deliberately uses lower
// rates (2 Hz estimates / 1 Hz error bitfields) than the single-device
// Inspector so the bus stays comfortable with N devices on it.
//
// Activated by `connect.js` when the picker is set to "all". The
// discovery `change` event drives incremental add/remove so newly
// arriving and timed-out devices update the grid live.
import { els } from './els.js';
import { state } from './connect.js';
import { AvlosClient } from '../runtime/avlos-client.js';
import { PollScheduler } from '../runtime/scheduler.js';

// Per-tile bookkeeping: { tile, client, tasks, ok }. Keyed by nodeId.
const tiles = new Map();
let scheduler = null;
let onChange = null;
let busTile = null;     // accent summary card pinned at the head of the grid

const FAST_HZ = 2;     // estimates + state/mode
const SLOW_HZ = 1;     // error bitfields → status dot, Vbus on bus card

/* Public ---------------------------------------------------------- */

export function startMultiPoll() {
  if (scheduler) return; // idempotent
  scheduler = new PollScheduler({
    fastPeriodMs: 1000 / FAST_HZ,
    slowPeriodMs: 1000 / SLOW_HZ,
  });
  ensureBusTile();
  registerBusTask();
  // Listen for device add/remove from discovery.
  if (state.discovery) {
    onChange = () => syncTiles();
    state.discovery.addEventListener('change', onChange);
  }
  syncTiles();
  scheduler.start();
}

export function stopMultiPoll() {
  if (!scheduler) return;
  scheduler.stop();
  scheduler = null;
  if (state.discovery && onChange) {
    state.discovery.removeEventListener('change', onChange);
  }
  onChange = null;
  for (const e of tiles.values()) {
    try { e.client && e.client.destroy(); } catch (_) {}
    e.tile.remove();
  }
  tiles.clear();
  if (busTile) { busTile.remove(); busTile = null; }
}

/* Tile lifecycle -------------------------------------------------- */

function syncTiles() {
  if (!state.discovery || !els.tileGrid) return;
  const list = state.discovery.snapshot();
  const seen = new Set();
  for (const d of list) {
    seen.add(d.nodeId);
    if (!tiles.has(d.nodeId)) addTile(d);
  }
  for (const id of [...tiles.keys()]) {
    if (!seen.has(id)) removeTile(id);
  }
  if (busTile) busTile.devices = list.length;
}

function ensureBusTile() {
  if (busTile || !els.tileGrid) return;
  busTile = document.createElement('tm-bus-tile');
  els.tileGrid.prepend(busTile);
}

// Periodic Vbus read against whichever device is currently first in
// `tiles`. Resolved at task-fire time so the source survives device
// add/remove without re-binding the task.
function registerBusTask() {
  if (!scheduler) return;
  scheduler.add({
    kind: 'slow',
    run: async () => {
      if (!busTile) return;
      const first = firstClient();
      if (!first) { busTile.vbus = NaN; return; }
      try { busTile.vbus = await first.get('Vbus'); }
      catch (_) { /* swallow */ }
    },
  });
}

function firstClient() {
  for (const e of tiles.values()) if (e.client) return e.client;
  return null;
}

function addTile(dev) {
  const tile = document.createElement('tm-device-tile');
  tile.nodeId  = dev.nodeId;
  tile.version = dev.spec ? dev.spec.version : `0x${dev.hash.toString(16)}`;
  els.tileGrid.appendChild(tile);

  const entry = { tile, client: null, tasks: [], errs: { sys: 0, ctrl: 0, motor: 0 } };
  tiles.set(dev.nodeId, entry);

  // Devices without a known spec can still appear (so the user knows
  // they're heartbeating) but we can't drive get/set against them.
  if (!dev.spec) { tile.connecting = true; return; }

  const client = new AvlosClient({
    driver:    state.driver,
    router:    state.router,
    nodeId:    dev.nodeId,
    spec:      dev.spec,
    discovery: state.discovery,
  });
  entry.client = client;
  tile.connecting = false;

  // Resolve enum option lookups once per device (controller.state /
  // .mode dtypes are uint8 enums; the spec carries the option array).
  const stateOpts = client.byPath.get('controller.state')?.options || [];
  const modeOpts  = client.byPath.get('controller.mode')?.options  || [];

  // Fast group — 2 Hz, ~5 reads per device.
  addTask(scheduler, 'fast', client, 'sensors.user_frame.position_estimate',
          v => { tile.pos = v; });
  addTask(scheduler, 'fast', client, 'sensors.user_frame.velocity_estimate',
          v => { tile.vel = v; });
  addTask(scheduler, 'fast', client, 'controller.current.Iq_estimate',
          v => { tile.iq = v; });
  addTask(scheduler, 'fast', client, 'controller.state',
          v => { tile.state = stateOpts[v] || String(v); });
  addTask(scheduler, 'fast', client, 'controller.mode',
          v => { tile.mode = modeOpts[v] || String(v); });

  // Slow group — 1 Hz, error bitfields ORed into a single ok/!ok dot,
  // plus the firmware's aggregate `calibrated` flag (motor + active sensor)
  // so the tri-state status dot can distinguish "needs calibration" (blue)
  // from "ready to drive" (green) without making the user open the tile.
  addTask(scheduler, 'slow', client, 'errors',
          v => { entry.errs.sys = +v || 0; updateOk(entry); });
  addTask(scheduler, 'slow', client, 'controller.errors',
          v => { entry.errs.ctrl = +v || 0; updateOk(entry); });
  addTask(scheduler, 'slow', client, 'motor.errors',
          v => { entry.errs.motor = +v || 0; updateOk(entry); });
  addTask(scheduler, 'slow', client, 'calibrated',
          v => { tile.calibrated = !!v; });
}

function removeTile(nodeId) {
  const entry = tiles.get(nodeId);
  if (!entry) return;
  try { entry.client && entry.client.destroy(); } catch (_) {}
  entry.tile.remove();
  tiles.delete(nodeId);
  // PollScheduler has no per-task removal; we rebuild from scratch
  // when the device set has shrunk so dead tasks don't keep firing
  // get() against a destroyed client.
  rebuildScheduler();
}

function rebuildScheduler() {
  if (!scheduler) return;
  scheduler.stop();
  scheduler.reset();
  registerBusTask();
  // Re-issue all surviving tasks. addTile() handles task registration,
  // so we re-run it on each existing device. We snapshot keys first
  // because the function mutates `tiles`.
  const survivors = [...tiles.values()];
  for (const e of survivors) {
    try { e.client && e.client.destroy(); } catch (_) {}
    e.tile.remove();
  }
  tiles.clear();
  if (state.discovery) {
    for (const d of state.discovery.snapshot()) addTile(d);
  }
  if (busTile) busTile.devices = state.discovery ? state.discovery.snapshot().length : 0;
  scheduler.start();
}

function addTask(sched, kind, client, path, apply) {
  if (!client.hasPath(path)) return;
  sched.add({
    kind,
    run: async () => {
      try { apply(await client.get(path)); }
      catch (_) { /* swallow per-tick failures */ }
    },
  });
}

function updateOk(entry) {
  const any = entry.errs.sys | entry.errs.ctrl | entry.errs.motor;
  entry.tile.ok = !any;
}
