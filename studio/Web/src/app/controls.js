// Bind the State / Mode / Actions / Setpoint widgets to the focused
// AvlosClient. Re-runs every time the user picks a different device, so
// setListener() is used to swap rather than accumulate handlers.
import { els, setListener } from './els.js';
import { state } from './connect.js';
import { HEALTH_CHANNELS } from './health.js';
import * as calibration from './calibration.js';

export function findEp(client, path) {
  return client.byPath.get(path) || null;
}

export function bindStaticControls(client) {
  const stateEp = findEp(client, 'controller.state');
  const modeEp  = findEp(client, 'controller.mode');

  els.ctlState.options = stateEp?.options || ['IDLE', 'CALIBRATE', 'CL_CONTROL'];
  els.ctlMode.options  = modeEp?.options  || ['CURRENT', 'VELOCITY', 'POSITION'];

  // Bind the calibration banner to this client up-front so the orchestrator
  // can start tracking error baselines on the very first poll cycle, before
  // the user clicks CALIBRATE.
  calibration.bindClient(client);

  setListener(els.ctlState, 'change', async e => {
    if (!stateEp) return;
    // The State card is the user's normal way to invoke calibration —
    // clicking CALIBRATE here is equivalent to calling controller.calibrate.
    // Arm the banner *before* the wire-side set so the UI feels instant
    // (no ~10 s of dead air).
    if (e.detail === 'CALIBRATE') calibration.arm();
    try { await client.set('controller.state', stateEp.options.indexOf(e.detail)); }
    catch (err) { console.warn(err); }
  });
  setListener(els.ctlMode, 'change', async e => {
    if (!modeEp) return;
    try { await client.set('controller.mode', modeEp.options.indexOf(e.detail)); }
    catch (err) { console.warn(err); }
  });

  // Action buttons. `controller.calibrate` and `controller.idle` aren't
  // exposed here on purpose — the State card already triggers those
  // transitions when the user picks CALIBRATE / IDLE. Keeping them only
  // in one place removes a redundancy we used to ship.
  bindAction(els.actSave,  client, 'save_config');
  bindAction(els.actReset, client, 'reset',
             'Reset the device now? Any active motion will stop.');
  bindAction(els.actErase, client, 'erase_config',
             'Erase saved configuration and reset the device? This cannot be undone.');

  // Setpoints
  bindSetpoint(els.spCurrent,  client, 'controller.current.Iq_setpoint',
               { jogFallback: 0.005, fmtUnit: 'A', precision: 3 });
  bindSetpoint(els.spVelocity, client, 'controller.velocity.setpoint',
               { jogFallback: 200, fmtUnit: 'ticks/s', precision: 2 });
  bindSetpoint(els.spPosition, client, 'controller.position.setpoint',
               { jogFallback: 100, fmtUnit: 'ticks', precision: 2 });

  // Bind bitmask flag lists from the spec into the consolidated health card.
  els.health.channels = HEALTH_CHANNELS.map(ch => ({
    key:   ch.key,
    label: ch.label,
    tone:  ch.tone,
    flags: findEp(client, ch.path)?.flags || [],
  }));
}

export function bindAction(btn, client, path, confirmMsg = false) {
  btn.disabled = !client.hasPath(path);
  btn.onclick = async () => {
    const prompt = confirmMsg === true
      ? `This will ${path.replace(/_/g, ' ')} on the device. Continue?`
      : (typeof confirmMsg === 'string' ? confirmMsg : '');
    if (prompt && !confirm(prompt)) return;
    btn.disabled = true;
    state.scheduler && state.scheduler.pause();
    try { await client.call(path); }
    catch (e) { console.warn(`${path} failed`, e); alert(`${path} failed: ${e.message}`); }
    finally {
      btn.disabled = false;
      state.scheduler && state.scheduler.resume();
    }
  };
}

export function bindSetpoint(el, client, path, { jogFallback, fmtUnit, precision }) {
  const ep = findEp(client, path);
  if (!ep) {
    el.disabled = true;
    el.label = 'Setpoint';
    el.unit = fmtUnit;
    return;
  }
  const step = (ep.meta && ep.meta.jog_step) || jogFallback;
  el.label = 'Setpoint';
  el.unit = ep.unit || fmtUnit;
  el.step = step;
  el.precision = precision;
  el.disabled = !ep.set;
  if (ep.get) {
    client.get(path).then(v => { el.value = v; }).catch(() => {});
  }
  setListener(el, 'change', async e => {
    try {
      await client.set(path, e.detail);
      el.value = e.detail;
    }
    catch (err) { console.warn('setpoint set failed', err); }
  });
  setListener(el, 'jog', async e => {
    try {
      const base = Number.isFinite(el.value) ? el.value : await client.get(path);
      const next = base + e.detail;
      await client.set(path, next);
      el.value = next;
    }
    catch (err) { console.warn('setpoint jog failed', err); }
  });
}
