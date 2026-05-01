// Wire the Export / Import buttons that live inside the Actions card
// to the focused AvlosClient. Re-runs on every device focus, so
// listeners are swapped via setListener (no accumulation).
//
// UX notes:
//  - The active button gets a `is-working` pulse during the multi-RPC
//    operation. Other action buttons disable so the user can't fire
//    save/reset/erase mid-import.
//  - A small inline status note appears below the button stack with a
//    tonal icon: ok (green check) auto-fades after 5 s, warn (amber)
//    and err (red) persist until the next operation.
//  - Polling is paused for the duration so the slcan adapter receive
//    buffer doesn't get flooded by fast-channel reads racing with the
//    bulk get/set traffic.
import { els, setListener } from './els.js';
import { state } from './connect.js';
import { exportConfig, importConfig, buildExportMeta } from './config-io.js';

const SVG_CHECK = `<svg class="icon" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="20 6 9 17 4 12"/></svg>`;
const SVG_ALERT = `<svg class="icon" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 3 L22 20 L2 20 Z"/>
  <line x1="12" y1="10" x2="12" y2="14"/>
  <circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>`;
const SVG_INFO = `<svg class="icon" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="9"/>
  <line x1="12" y1="11" x2="12" y2="16"/>
  <circle cx="12" cy="8" r="0.6" fill="currentColor"/></svg>`;

let _statusFadeTimer = null;
let _statusClearTimer = null;

function showStatus(text, tone = 'ok', { autoFade = false } = {}) {
  const el = els.cfgStatus;
  if (!el) return;
  clearTimeout(_statusFadeTimer); _statusFadeTimer = null;
  clearTimeout(_statusClearTimer); _statusClearTimer = null;
  el.classList.remove('fading');
  el.dataset.tone = tone;
  const icon = tone === 'ok' ? SVG_CHECK : tone === 'err' ? SVG_ALERT : SVG_INFO;
  el.innerHTML = `${icon}<span>${text}</span>`;
  el.hidden = false;
  if (autoFade) {
    _statusFadeTimer = setTimeout(() => {
      el.classList.add('fading');
      _statusClearTimer = setTimeout(() => {
        el.hidden = true;
        el.classList.remove('fading');
        el.innerHTML = '';
      }, 450);
    }, 5000);
  }
}

function showProgress(text) {
  const el = els.cfgStatus;
  if (!el) return;
  clearTimeout(_statusFadeTimer); _statusFadeTimer = null;
  clearTimeout(_statusClearTimer); _statusClearTimer = null;
  el.classList.remove('fading');
  el.dataset.tone = 'info';
  el.innerHTML = `${SVG_INFO}<span>${text}</span>`;
  el.hidden = false;
}

function hideStatus() {
  const el = els.cfgStatus;
  if (!el) return;
  clearTimeout(_statusFadeTimer); _statusFadeTimer = null;
  clearTimeout(_statusClearTimer); _statusClearTimer = null;
  el.hidden = true;
  el.classList.remove('fading');
  el.innerHTML = '';
}

// `tinymovr-config-node3-2.5.x-202605011842.json`
function buildFilename(client) {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
           + `${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `tinymovr-config-node${client.nodeId}-${client.spec.version}-${ts}.json`;
}

function downloadJson(filename, payload) {
  const text = JSON.stringify(payload, null, 2) + '\n';
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke async so older Chromium variants have time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readFileText(file) {
  if (file.text) return file.text();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error || new Error('read failed'));
    fr.readAsText(file);
  });
}

// While a long-running config op runs, mark the active button as
// "working" (pulsing tint) and disable every other action button so
// the user can't accidentally fire save/reset/erase mid-op.
const otherActions = () => [els.actSave, els.actReset, els.actErase];
function setBusy(activeBtn, busy, busyLabel) {
  if (busy) {
    activeBtn.dataset.idleLabel = activeBtn.textContent;
    activeBtn.textContent = busyLabel;
    activeBtn.classList.add('is-working');
    activeBtn.disabled = true;
    for (const b of otherActions()) if (b) b.disabled = true;
    if (els.cfgExport && els.cfgExport !== activeBtn) els.cfgExport.disabled = true;
    if (els.cfgImport && els.cfgImport !== activeBtn) els.cfgImport.disabled = true;
  } else {
    if (activeBtn.dataset.idleLabel) {
      activeBtn.textContent = activeBtn.dataset.idleLabel;
      delete activeBtn.dataset.idleLabel;
    }
    activeBtn.classList.remove('is-working');
    activeBtn.disabled = false;
    for (const b of otherActions()) if (b) b.disabled = false;
    if (els.cfgExport) els.cfgExport.disabled = false;
    if (els.cfgImport) els.cfgImport.disabled = false;
  }
}

async function onExport(client) {
  if (!client) return;
  state.scheduler && state.scheduler.pause();
  setBusy(els.cfgExport, true, 'Exporting…');
  showProgress('Reading config from device…');
  try {
    const { data, count, errors, total } = await exportConfig(client, {
      onProgress: ({ index, total }) => {
        showProgress(`Reading config from device… ${index}/${total}`);
      },
    });
    const payload = { _meta: buildExportMeta(client), ...data };
    const filename = buildFilename(client);
    downloadJson(filename, payload);
    if (errors.length) {
      showStatus(
        `Exported ${count} of ${total} settings (${errors.length} read error${errors.length === 1 ? '' : 's'} — see console)`,
        'warn',
      );
    } else {
      showStatus(`Exported ${count} settings to ${filename}`, 'ok', { autoFade: true });
    }
  } catch (err) {
    console.error('[config-toolbar] export failed', err);
    showStatus(`Export failed: ${err.message || err}`, 'err');
  } finally {
    setBusy(els.cfgExport, false);
    state.scheduler && state.scheduler.resume();
  }
}

async function onImportFileChosen(client, file) {
  if (!client || !file) return;
  // Show a brief "Reading file…" before busy-state kicks in so the
  // user gets immediate feedback.
  showProgress('Reading file…');
  let parsed;
  try {
    const text = await readFileText(file);
    parsed = JSON.parse(text);
  } catch (err) {
    showStatus(`Could not parse JSON: ${err.message || err}`, 'err');
    return;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    showStatus('Expected a JSON object at the top level.', 'err');
    return;
  }
  const proceed = window.confirm(
    `Apply config from "${file.name}" to node ${client.nodeId}?\n\n`
    + 'Active motion is not stopped automatically. For live tuning, '
    + 'consider switching the controller to IDLE first.',
  );
  if (!proceed) {
    hideStatus();
    return;
  }
  state.scheduler && state.scheduler.pause();
  setBusy(els.cfgImport, true, 'Importing…');
  showProgress('Applying config to device…');
  try {
    const r = await importConfig(client, parsed, {
      onProgress: ({ index, total }) => {
        showProgress(`Applying & verifying ${index}/${total}…`);
      },
    });
    // Verified count: applied minus any read-back mismatches, so the
    // headline number is "settings actually holding their target value
    // on the device" rather than "frames sent on the wire".
    const verified = r.applied - r.mismatches.length;
    const parts = [`Verified ${verified} of ${r.total}`];
    if (r.mismatches.length) parts.push(`${r.mismatches.length} mismatched`);
    if (r.skipped.length) parts.push(`${r.skipped.length} unknown`);
    if (r.errors.length) parts.push(`${r.errors.length} error${r.errors.length === 1 ? '' : 's'}`);
    if (r.skipped.length || r.errors.length || r.mismatches.length) {
      console.warn('[config-toolbar] import report:', {
        skipped: r.skipped,
        errors: r.errors,
        mismatches: r.mismatches,
      });
    }
    let tone = 'ok';
    let autoFade = true;
    if (r.errors.length || r.mismatches.length) { tone = 'err'; autoFade = false; }
    else if (r.skipped.length) { tone = 'warn'; autoFade = false; }
    const hasIssues = r.skipped.length || r.errors.length || r.mismatches.length;
    showStatus(parts.join(' · ') + (hasIssues ? ' — see console' : ''), tone, { autoFade });
  } catch (err) {
    console.error('[config-toolbar] import failed', err);
    showStatus(`Import failed: ${err.message || err}`, 'err');
  } finally {
    setBusy(els.cfgImport, false);
    state.scheduler && state.scheduler.resume();
  }
}

export function bindConfigToolbar(client) {
  if (!els.cfgExport || !els.cfgImport || !els.cfgImportFile) return;
  hideStatus();
  if (!client) {
    els.cfgExport.disabled = true;
    els.cfgImport.disabled = true;
    return;
  }
  els.cfgExport.disabled = false;
  els.cfgImport.disabled = false;

  setListener(els.cfgExport, 'click', () => onExport(client));
  setListener(els.cfgImport, 'click', () => {
    // Reset value first so re-picking the same file still fires `change`.
    els.cfgImportFile.value = '';
    els.cfgImportFile.click();
  });
  setListener(els.cfgImportFile, 'change', async () => {
    const file = els.cfgImportFile.files && els.cfgImportFile.files[0];
    try { await onImportFileChosen(client, file); }
    finally { els.cfgImportFile.value = ''; }
  });
}

export function clearConfigToolbar() {
  hideStatus();
  if (els.cfgExport) els.cfgExport.disabled = true;
  if (els.cfgImport) els.cfgImport.disabled = true;
}
