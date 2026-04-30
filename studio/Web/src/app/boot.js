// Boot wiring: page-load setup that runs once. Theme persistence,
// Web Serial detection, bitrate persistence, and the connect-button
// glue that toggles between connect() and disconnect().
import { els, setStatus } from './els.js';
import {
  state, connect, disconnect, onPickerChange, tryAutoReconnect,
} from './connect.js';
import { bindPlotToggles } from './plotting.js';

export function boot() {
  const savedTheme = localStorage.getItem('tm-theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  els.theme.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('tm-theme', next);
  });

  if (!('serial' in navigator)) {
    els.unsupported.hidden = false;
    els.connect.disabled = true;
    els.bitrate.disabled = true;
  }

  els.connect.addEventListener('click', () => {
    state.driver ? disconnect() : connect();
  });

  els.picker.addEventListener('change', onPickerChange);
  bindPlotToggles();

  // Tile click → set picker to that node and trigger the same
  // `change` flow the user gets from picking a node manually.
  els.tileGrid.addEventListener('focus-device', e => {
    const nodeId = e.detail?.nodeId;
    if (nodeId == null) return;
    els.picker.value = String(nodeId);
    onPickerChange();
  });

  setStatus('disconnected', 'Disconnected');
  els.bitrate.value = localStorage.getItem('tm-bitrate') || 'S8';
  els.bitrate.addEventListener('change', () => {
    localStorage.setItem('tm-bitrate', els.bitrate.value);
  });

  // Silent reconnect after Vite HMR full-reload / manual refresh: we can
  // reopen any port the user previously authorized without re-prompting.
  tryAutoReconnect().catch(e => console.debug('[tm] auto-reconnect skipped:', e));
}
