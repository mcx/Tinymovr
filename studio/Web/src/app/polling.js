// Bind the focused AvlosClient to the dashboard's live readouts. Two
// rate buckets (fast estimates ~20 Hz, slow status ~2 Hz) and a single
// PollScheduler instance, kept in `state.scheduler` so action buttons
// can pause/resume it during destructive operations.
import { els } from './els.js';
import { state } from './connect.js';
import { findEp } from './controls.js';
import { HEALTH_CHANNELS } from './health.js';
import { PollScheduler } from '../runtime/scheduler.js';

// Sample buffers store parallel `{ts, v}` arrays so the expanded plot
// view can window by wall-clock time. The buffer cap is generous —
// 6000 samples ≈ 5 min @ 20 Hz / 50 min @ 2 Hz — enough for the
// longest plot window. The sparkline however only needs a tight
// recent window, so we return just the tail: showing the full buffer
// would compress more and more samples into the same 100-px trace
// and the sparkline would visually freeze over time.
const SPARKLINE_TAIL = 100;
export function pushSample(path, value, max = 6000) {
  const buf = state.buffers[path] || (state.buffers[path] = { ts: [], v: [] });
  buf.ts.push(performance.now());
  buf.v.push(value);
  while (buf.v.length > max) { buf.v.shift(); buf.ts.shift(); }
  // Return a *new* tail array so the sparkline (which uses
  // reference-equality to detect changes) re-renders every tick.
  return buf.v.slice(-SPARKLINE_TAIL);
}

// Push the latest buffer to the shared <dash-plot> if (a) it's open and
// (b) the metric the user is focusing on is the one we just sampled.
// Hidden plots stay in sync the moment they're re-opened because we
// always keep `state.buffers[path]` up to date.
function updatePlotIfActive(key) {
  if (state.activePlotKey === key && els.plot && !els.plotHost.hidden) {
    els.plot.update(state.buffers[key]);
  }
}

export function startPolling(client) {
  const sched = new PollScheduler({ fastPeriodMs: 50, slowPeriodMs: 500 });
  state.scheduler = sched;

  // Fast: estimates (and the active setpoint, for round-tripping confidence).
  const fastReads = [
    {
      paths: ['sensors.user_frame.position_estimate'],
      apply: v => {
        els.mPos.value = formatNum(v, 2);
        els.sPos.values = pushSample('pos', v);
        updatePlotIfActive('pos');
      },
    },
    {
      paths: ['sensors.user_frame.velocity_estimate'],
      apply: v => {
        els.mVel.value = formatNum(v, 2);
        els.sVel.values = pushSample('vel', v);
        updatePlotIfActive('vel');
      },
    },
    {
      paths: ['controller.current.Iq_estimate'],
      apply: v => {
        els.mIq.value = formatNum(v, 3);
        els.sIq.values = pushSample('iq', v);
        updatePlotIfActive('iq');
      },
    },
    {
      paths: ['Ibus'],
      apply: v => {
        els.ibus.value = formatNum(v, 3);
        els.ibusSpark.values = pushSample('ibus', v);
        updatePlotIfActive('ibus');
      },
    },
  ];

  const slowReads = [
    {
      paths: ['Vbus'],
      apply: v => { els.vbus.value = v; },
    },
    {
      paths: ['power'],
      apply: v => {
        els.power.value = formatNum(v, 2);
        els.powerSpark.values = pushSample('power', v);
        updatePlotIfActive('power');
      },
    },
    {
      paths: ['temp'],
      apply: v => { els.temp.value = v; },
    },
    {
      paths: ['controller.current.Iq_setpoint'],
      apply: v => { els.spCurrent.value = v; },
    },
    {
      paths: ['controller.velocity.setpoint'],
      apply: v => { els.spVelocity.value = v; },
    },
    {
      paths: ['controller.position.setpoint'],
      apply: v => { els.spPosition.value = v; },
    },
    {
      paths: ['controller.state'],
      apply: v => {
        const ep = findEp(client, 'controller.state');
        const opt = ep?.options?.[v];
        if (opt) els.ctlState.value = opt;
      },
    },
    {
      paths: ['controller.mode'],
      apply: v => {
        const ep = findEp(client, 'controller.mode');
        const opt = ep?.options?.[v];
        if (opt) {
          els.ctlMode.value = opt;
          els.spCurrent.active  = (opt === 'CURRENT');
          els.spVelocity.active = (opt === 'VELOCITY');
          els.spPosition.active = (opt === 'POSITION');
        }
      },
    },
    ...HEALTH_CHANNELS.map(ch => ({
      paths: [ch.path],
      apply: v => els.health.setValue(ch.key, v),
    })),
  ];

  for (const t of fastReads) registerPoll(client, sched, 'fast', t);
  for (const t of slowReads) registerPoll(client, sched, 'slow', t);

  sched.start();
}

export function registerPoll(client, sched, kind, task) {
  const path = task.paths.find(p => client.hasPath(p));
  if (!path) return;
  sched.add({
    kind,
    run: async () => {
      try {
        const v = await client.get(path);
        task.apply(v);
      } catch (e) { /* swallow per-tick failures */ }
    },
  });
}

export function formatNum(v, digits) {
  if (!Number.isFinite(v)) return '—';
  if (digits != null) return v.toFixed(digits);
  if (Math.abs(v) >= 10000) return v.toFixed(0);
  if (Math.abs(v) >= 100)   return v.toFixed(1);
  if (Math.abs(v) >= 1)     return v.toFixed(2);
  return v.toFixed(4);
}
