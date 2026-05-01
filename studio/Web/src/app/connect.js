// Connection lifecycle, device discovery roster, and focus-a-device
// routing. The module-level `state` object is intentionally exported
// rather than encapsulated so the rest of the app (controls, polling,
// explorer) can read/mutate the live driver, scheduler and client
// without prop-drilling. The cycle with controls.js/polling.js is safe
// because every reader touches `state` only from inside a function body.
import SPEC_DATA from '../specs.generated.json';
import { els, setStatus } from './els.js';
import { SlcanDriver } from '../runtime/slcan.js';
import { CanRouter } from '../runtime/can-router.js';
import { HeartbeatDiscovery } from '../runtime/discovery.js';
import { AvlosClient } from '../runtime/avlos-client.js';
import { HEARTBEAT_BASE, HEARTBEAT_MASK } from '../runtime/can-id.js';
import { bindStaticControls } from './controls.js';
import { buildExplorer } from './explorer.js';
import { startPolling, clearCalStatus } from './polling.js';
import { startMultiPoll, stopMultiPoll } from './multipoll.js';
import { bindConfigToolbar, clearConfigToolbar } from './config-toolbar.js';
import * as calibration from './calibration.js';

// Sentinel value used by the picker to switch into the fleet tile view.
const ALL = 'all';

const TM_SPECS = (SPEC_DATA?.specs || []).filter(s => s.family === 'tinymovr');

export const state = {
  driver: null,
  router: null,
  discovery: null,
  scheduler: null,
  client: null,           // AvlosClient for the focused device
  focusedNodeId: null,
  buffers: {},            // path -> rolling sample array (for sparklines)
  activePlotKey: null,    // key into buffers/METRICS that the plot is showing
};

// Enable verbose driver/discovery logging via ?debug=1 or localStorage flag.
const DEBUG = new URLSearchParams(location.search).has('debug')
           || localStorage.getItem('tm-debug') === '1';
let _hbCount = 0;

// sessionStorage flag survives a page reload (HMR full-reload, manual F5)
// but not new tabs. Combined with `navigator.serial.getPorts()` it lets
// the dashboard silently re-attach to the previously authorized adapter
// without re-prompting the user.
const KEEP_FLAG = 'tm-keep-connection';
const setKeepFlag = on => {
  try { on ? sessionStorage.setItem(KEEP_FLAG, '1') : sessionStorage.removeItem(KEEP_FLAG); }
  catch (_) {}
};

export async function connect(presetPort = null) {
  if (state.driver) return disconnect();
  els.connect.disabled = true;
  setStatus('connecting', 'Connecting…');
  try {
    const port = presetPort || await navigator.serial.requestPort({});
    // Per-frame slcan logging is opt-in via ?debug=1 — always-on flooded
    // the console with hundreds of msg/s from the polling loop.
    const driver = new SlcanDriver(port, { debug: DEBUG });
    const router = new CanRouter();
    driver.addEventListener('frame', e => router.dispatch(e.detail));
    driver.addEventListener('error', e => console.warn('slcan error', e.detail));
    driver.addEventListener('closed', () => { teardown(); });

    await driver.open(els.bitrate.value);

    const discovery = new HeartbeatDiscovery({
      router,
      specs: TM_SPECS,
      hashAliases: SPEC_DATA?.hashAliases || {},
    });
    discovery.addEventListener('change', () => {
      const list = discovery.snapshot();
      if (DEBUG || list.length) {
        console.info('[discovery] devices', list.map(d => ({
          nodeId: d.nodeId,
          hash: '0x' + d.hash.toString(16),
          spec: d.spec ? d.spec.version : 'UNKNOWN',
        })));
      }
      updatePicker();
    });

    state.driver = driver;
    state.router = router;
    state.discovery = discovery;

    // Counter listener: track every frame for the telemetry chip.
    router.add(() => true, frame => {
      const isHb = (frame.id & HEARTBEAT_MASK) === HEARTBEAT_BASE && !frame.rtr;
      if (isHb) _hbCount++;
      els.telBytes.textContent = driver.bytesRx;
      els.telFrames.textContent = driver.framesRx;
      els.telHb.textContent = _hbCount;
      els.telemetry.dataset.flow = 'active';
    });
    els.telemetry.hidden = false;
    els.telemetry.dataset.flow = 'idle';
    els.telBytes.textContent = '0';
    els.telFrames.textContent = '0';
    els.telHb.textContent = '0';
    _hbCount = 0;

    setStatus('connected', 'Connected');
    els.connect.textContent = 'Disconnect';
    els.connect.dataset.active = 'true';
    els.bitrate.disabled = true;
    els.emptyText.textContent = 'Listening for Tinymovr heartbeats on the bus…';
    els.emptySub.textContent = 'If nothing appears within a few seconds, check the bitrate (currently '
      + els.bitrate.options[els.bitrate.selectedIndex].textContent
      + ') and that the adapter is in slcan mode. The chip in the header shows live RX byte/frame counts.';
    updatePicker();
    setKeepFlag(true);
    console.info('[tm] dashboard connected; awaiting heartbeats…');
  } catch (e) {
    console.error('[tm] connect failed:', e);
    setStatus('disconnected', 'Failed: ' + (e.message || e));
    setKeepFlag(false);
    teardown();
  } finally {
    els.connect.disabled = false;
  }
}

export async function disconnect() {
  els.connect.disabled = true;
  setKeepFlag(false);
  try { state.driver && await state.driver.close(); } catch (_) {}
  teardown();
  els.connect.disabled = false;
}

/* Try to silently reopen the most recently authorized serial port. Used
   after a Vite HMR full-reload so the WebSerial connection is restored
   without forcing the user back through requestPort(). No-ops if the
   user wasn't connected before, or no authorized ports remain. */
export async function tryAutoReconnect() {
  if (!('serial' in navigator)) return;
  let kept;
  try { kept = sessionStorage.getItem(KEEP_FLAG); } catch (_) {}
  if (!kept) return;
  let ports;
  try { ports = await navigator.serial.getPorts(); }
  catch (e) { console.debug('[tm] getPorts() failed:', e); return; }
  const port = ports?.[ports.length - 1];
  if (!port) { setKeepFlag(false); return; }
  console.info('[tm] auto-reconnecting to previously authorized port');
  await connect(port);
}

export function teardown() {
  stopMultiPoll();
  calibration.reset();
  clearCalStatus();
  clearConfigToolbar();
  if (state.scheduler) state.scheduler.stop();
  if (state.discovery) state.discovery.destroy();
  if (state.client) state.client.destroy();
  state.driver = null;
  state.router = null;
  state.discovery = null;
  state.scheduler = null;
  state.client = null;
  state.focusedNodeId = null;
  state.buffers = {};
  state.activePlotKey = null;
  if (els.plotHost) {
    els.plotHost.hidden = true;
    els.plotHost.classList.remove('appear');
  }
  els.tileView.hidden = true;
  els.connect.textContent = 'Connect';
  els.connect.dataset.active = 'false';
  els.bitrate.disabled = false;
  els.picker.disabled = true;
  els.picker.innerHTML = '<option value="">— Device —</option>';
  els.fleet.disabled = true;
  els.fleet.dataset.active = 'false';
  els.telemetry.hidden = true;
  els.view.hidden = true;
  els.empty.hidden = false;
  els.emptyText.textContent = 'Connect to your slcan adapter to discover Tinymovr devices on the bus.';
  els.emptySub.textContent = 'Heartbeats are decoded automatically; pick a device from the dropdown above.';
  setStatus('disconnected', 'Disconnected');
}

export function updatePicker() {
  if (!state.discovery) return;
  const list = state.discovery.snapshot();
  els.picker.disabled = list.length === 0;
  // The fleet button mirrors the picker's enabled state — pointless
  // (and confusing) to "Show all devices" when no devices are visible.
  els.fleet.disabled = list.length === 0;
  const prev = els.picker.value;
  if (list.length === 0) {
    els.picker.innerHTML = '<option value="">(no devices)</option>';
    // Last device just dropped: leave fleet view, surface the
    // listening-for-heartbeats placeholder.
    stopMultiPoll();
    els.tileView.hidden = true;
    els.view.hidden = true;
    els.empty.hidden = false;
    state.focusedNodeId = null;
    return;
  } else {
    const opts = list.map(d => {
      const tag = d.spec
        ? `${d.spec.version}`
        : `unknown hash 0x${d.hash.toString(16)}`;
      return `<option value="${d.nodeId}">Node ${d.nodeId} — ${tag}</option>`;
    });
    // The "All devices" sentinel sits at the top whenever at least one
    // device is on the bus. Default selection on first connect is the
    // fleet view — feels right when the user has multiple devices, and
    // is one click away from inspecting any single node.
    opts.unshift(`<option value="${ALL}">All devices</option>`);
    els.picker.innerHTML = opts.join('');
  }
  if (prev === ALL && list.length) {
    els.picker.value = ALL;
  } else if (list.find(d => String(d.nodeId) === prev)) {
    els.picker.value = prev;
  } else if (list.length) {
    els.picker.value = ALL;
    onPickerChange();
  }
  // Keep the tile grid in sync whenever the device set changes, even
  // if the user is currently in fleet view (the multipoll runtime
  // also subscribes to the discovery `change` event for live updates).
  if (state.focusedNodeId !== null
      && !list.find(d => d.nodeId === state.focusedNodeId)) {
    focusDevice(null);
  }
}

export function onPickerChange() {
  const value = els.picker.value;
  // Keep the fleet button visually in sync with the picker selection,
  // independent of which control the user used to switch view.
  els.fleet.dataset.active = value === ALL ? 'true' : 'false';
  if (value === ALL) return enterFleetMode();
  const nodeId = parseInt(value, 10);
  if (Number.isNaN(nodeId)) return focusDevice(null);
  focusDevice(nodeId);
}

function enterFleetMode() {
  // Tear down any single-device polling that was running.
  calibration.reset();
  clearCalStatus();
  clearConfigToolbar();
  if (state.client) { state.client.destroy(); state.client = null; }
  if (state.scheduler) { state.scheduler.stop(); state.scheduler = null; }
  state.focusedNodeId = null;
  state.buffers = {};
  state.activePlotKey = null;
  if (els.plotHost) {
    els.plotHost.hidden = true;
    els.plotHost.classList.remove('appear');
  }
  els.view.hidden = true;
  els.empty.hidden = true;
  els.tileView.hidden = false;
  startMultiPoll();
}

export function focusDevice(nodeId) {
  if (state.client) { state.client.destroy(); state.client = null; }
  if (state.scheduler) { state.scheduler.stop(); state.scheduler = null; }
  // Switching into the Inspector implies we leave fleet view.
  stopMultiPoll();
  // Drop any stale calibration UI from the previously focused device.
  // The slow-poll on the new client will repopulate the indicator within
  // ~500 ms; hiding here avoids a brief mismatch between the State card
  // header and the device just switched into.
  calibration.reset();
  clearCalStatus();
  els.tileView.hidden = true;
  state.focusedNodeId = nodeId;
  state.buffers = {};
  if (nodeId === null || !state.discovery) {
    els.view.hidden = true;
    els.empty.hidden = false;
    return;
  }
  const dev = state.discovery.devices.get(nodeId);
  if (!dev || !dev.spec) {
    els.view.hidden = true;
    els.empty.hidden = false;
    return;
  }
  state.client = new AvlosClient({
    driver: state.driver,
    router: state.router,
    nodeId,
    spec: dev.spec,
    discovery: state.discovery,
  });
  els.view.hidden = false;
  els.empty.hidden = true;
  bindStaticControls(state.client);
  buildExplorer(state.client);
  bindConfigToolbar(state.client);
  startPolling(state.client);
}
