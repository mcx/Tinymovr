// Calibration banner orchestrator. Runs a tiny state machine in lockstep
// with the slow poll cycle (controller.state + *.errors @ 2 Hz) so the
// dashboard can give a first-time user a guided "calibrate now" flow:
//
//   user clicks CALIBRATE
//     → arm()              banner shows "Calibrating motor…"
//     → poll observes state == CALIBRATE                (now 'running')
//     → ... ~10 s elapses ...
//     → poll observes state == IDLE again
//        → no new error bits since baseline → 'success' (offer CL_CONTROL)
//        → new error bits raised             → 'error'  (friendly hints)
//
// If the firmware refuses to enter CALIBRATE (e.g. an existing error blocks
// it), arm() times out after WATCHDOG_MS and the banner switches to
// 'timeout', pointing the user at the Health card.
//
// The orchestrator is connect-scoped: a fresh client (or disconnect) calls
// reset() and the banner clears cleanly.

import { els } from './els.js';

// Channels we watch for newly-raised error bits during calibration. Keys
// match HEALTH_CHANNELS in app/health.js so we can attach to the same
// poll callbacks. Sensor error endpoints aren't always polled by the
// dashboard; for now we lean on the system-level errors which are.
const WATCHED_ERROR_KEYS = new Set([
  'sysErr',     // errors          → UNDERVOLTAGE
  'ctrlErr',    // controller.errors → CURRENT_LIMIT_EXCEEDED, PRE_CL_I_SD_EXCEEDED
  'motorErr',   // motor.errors    → PHASE_RESISTANCE_OUT_OF_RANGE, …
]);

// Friendly descriptions for every error bit that can plausibly appear
// during calibration. Keep these short, action-oriented and
// vendor-agnostic. The flag name is rendered alongside in monospace, so
// these explain *why* and *what to do*, not what the bit is called.
const ERROR_HINTS = {
  // motor.errors
  PHASE_RESISTANCE_OUT_OF_RANGE:
    'Measured phase resistance is outside the expected range. Check motor wiring and connectors, '
    + 'and confirm the motor type (high-current vs. gimbal) matches the motor.',
  PHASE_INDUCTANCE_OUT_OF_RANGE:
    'Measured phase inductance is outside the expected range. Check motor wiring for shorts or '
    + 'open circuits.',
  POLE_PAIRS_CALCULATION_DID_NOT_CONVERGE:
    'The pole-pair calculation didn\u2019t converge. Make sure the shaft is free to rotate during '
    + 'calibration and the encoder is mounted concentrically with the shaft.',
  POLE_PAIRS_OUT_OF_RANGE:
    'Detected pole pairs are out of range. Check that the encoder magnet is mounted correctly and '
    + 'that nothing is binding the rotor.',
  ABNORMAL_CALIBRATION_VOLTAGE:
    'Calibration voltage was abnormal. Verify the bus voltage is stable, the motor isn\u2019t shorted, '
    + 'and that motor.I_cal is appropriate for the motor (≤0.5 V on R5/R3 boards, ≤5 V on M5).',

  // controller.errors
  CURRENT_LIMIT_EXCEEDED:
    'The current limit was exceeded. Lower controller.current.Iq_limit or check the motor windings '
    + 'for shorts.',
  PRE_CL_I_SD_EXCEEDED:
    'Pre-closed-loop current shutdown tripped. The motor drew more current than expected before '
    + 'closing the loop — verify wiring and try reducing motor.I_cal.',

  // controller.warnings (rarely raised during calibration but possible)
  VELOCITY_LIMITED:
    'Velocity was clamped during the run. Increase controller.velocity.limit or reduce setpoints.',
  CURRENT_LIMITED:
    'Current was clamped during the run. Increase controller.current.Iq_limit if the motor needs more.',
  MODULATION_LIMITED:
    'Modulation was saturated. Bus voltage may be too low for the requested operating point.',

  // errors (system-level)
  UNDERVOLTAGE:
    'Bus voltage is below the operating threshold. Check the power supply and connectors before '
    + 'retrying calibration.',

  // sensor errors (informational; surfaced if present in the spec)
  CALIBRATION_FAILED:
    'A position sensor reported a calibration failure. Check encoder wiring, supply voltage and '
    + 'magnet alignment, then retry.',
  READING_UNSTABLE:
    'Position sensor readings were unstable. Check for EMI sources, loose connectors and magnet '
    + 'alignment.',
};

// How long arm() is willing to wait before declaring the calibration didn't
// start. The firmware's own calibration takes ~10 s, but it only requires
// ~50 ms to flip controller.state into CALIBRATE; 3 s is generous enough
// for slcan latency on a busy adapter without making the user wait long
// to learn that the firmware refused.
const WATCHDOG_MS = 3000;

// Slow polls run @ 500 ms; a one-second tick gives the elapsed counter
// a smooth feel without competing with the request fabric.
const TICK_MS = 1000;

const _state = {
  phase:         'idle',   // idle | armed | running | finished
  client:        null,
  baselineMask:  Object.create(null), // key -> bitmask at arm time
  latestMask:    Object.create(null), // key -> last polled bitmask
  startedAt:     0,
  tickT:         null,
};

function banner() { return els.calBanner; }

function flagsFor(key) {
  if (!_state.client) return [];
  const path = pathFor(key);
  return _state.client.byPath.get(path)?.flags || [];
}

function pathFor(key) {
  switch (key) {
    case 'sysErr':   return 'errors';
    case 'ctrlErr':  return 'controller.errors';
    case 'motorErr': return 'motor.errors';
    default: return null;
  }
}

function newlyRaisedFlags() {
  const out = [];
  for (const key of WATCHED_ERROR_KEYS) {
    const flags = flagsFor(key);
    if (!flags.length) continue;
    const before = _state.baselineMask[key] | 0;
    const after  = _state.latestMask[key] | 0;
    const raised = after & ~before;
    if (!raised) continue;
    for (let i = 0; i < flags.length; i++) {
      if ((raised >> i) & 1) {
        const flag = flags[i];
        out.push({
          flag,
          message: ERROR_HINTS[flag] || 'Check the device documentation for this error bit.',
        });
      }
    }
  }
  return out;
}

function startTicker() {
  stopTicker();
  _state.tickT = setInterval(() => {
    if (_state.phase !== 'armed' && _state.phase !== 'running') return;
    const elapsed = performance.now() - _state.startedAt;
    if (banner()) banner().elapsedMs = elapsed;
    if (_state.phase === 'armed' && elapsed > WATCHDOG_MS) {
      finish('timeout');
    }
  }, TICK_MS);
}

function stopTicker() {
  if (_state.tickT) clearInterval(_state.tickT);
  _state.tickT = null;
}

function attachListeners() {
  const b = banner();
  if (!b || b._calBound) return;
  b._calBound = true;
  b.addEventListener('dismiss', () => {
    _state.phase = 'idle';
    stopTicker();
    if (banner()) banner().phase = 'hidden';
  });
  b.addEventListener('enter-cl', async () => {
    const c = _state.client;
    const ep = c?.byPath.get('controller.state');
    if (!c || !ep) return;
    const idx = ep.options?.indexOf('CL_CONTROL');
    if (idx == null || idx < 0) return;
    try { await c.set('controller.state', idx); }
    catch (err) { console.warn('Enter CL_CONTROL failed', err); }
    finally {
      _state.phase = 'idle';
      stopTicker();
      if (banner()) banner().phase = 'hidden';
    }
  });
}

/* Public API ----------------------------------------------------------- */

// Bind to a specific AvlosClient. Called from controls.js on focus. Resets
// any in-flight calibration tracking and seeds baseline masks so a stale
// banner from a prior device is never carried across.
export function bindClient(client) {
  reset();
  _state.client = client;
  attachListeners();
}

// Forget the active client and hide the banner. Called on disconnect or
// when the user picks a different node.
export function reset() {
  stopTicker();
  _state.phase = 'idle';
  _state.client = null;
  _state.baselineMask = Object.create(null);
  _state.latestMask = Object.create(null);
  _state.startedAt = 0;
  if (banner()) {
    banner().phase = 'hidden';
    banner().errors = [];
    banner().canEnterCl = false;
    banner().elapsedMs = 0;
  }
}

// Called by controls.js the moment the user picks CALIBRATE on the State
// card. Snapshots the current error masks so we can diff later, shows the
// banner in 'running' phase optimistically, and starts the watchdog.
export function arm() {
  if (!_state.client || !banner()) return;
  _state.phase        = 'armed';
  _state.startedAt    = performance.now();
  _state.baselineMask = { ..._state.latestMask };
  banner().errors     = [];
  banner().canEnterCl = false;
  banner().elapsedMs  = 0;
  banner().phase      = 'running';
  startTicker();
}

// Called by polling.js after every controller.state poll. `option` is the
// resolved enum string ('IDLE' | 'CALIBRATE' | 'CL_CONTROL').
export function observeState(option) {
  if (_state.phase === 'armed' && option === 'CALIBRATE') {
    _state.phase = 'running';
    return;
  }
  if (_state.phase === 'running' && option === 'IDLE') {
    finish();
  }
}

// Called by polling.js after every error-channel poll. Tracks the latest
// bitmask per channel so the diff at finish() can identify newly raised
// bits without missing transient errors that may have already been cleared.
export function observeErrors(channelKey, mask) {
  if (!WATCHED_ERROR_KEYS.has(channelKey)) return;
  _state.latestMask[channelKey] = mask | 0;
  if (_state.phase === 'running') {
    const errors = newlyRaisedFlags();
    if (errors.length && banner()) banner().errors = errors;
  }
}

function finish(forcePhase) {
  stopTicker();
  if (forcePhase === 'timeout') {
    _state.phase = 'finished';
    if (banner()) {
      banner().errors = newlyRaisedFlags();
      banner().canEnterCl = false;
      banner().phase = 'timeout';
    }
    return;
  }
  const errors = newlyRaisedFlags();
  _state.phase = 'finished';
  if (!banner()) return;
  banner().errors = errors;
  banner().canEnterCl = errors.length === 0;
  banner().phase = errors.length ? 'error' : 'success';
}
