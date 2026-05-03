// Single shared, full-width plot card. Clicking any sparkline focuses
// that metric in the plot; clicking the same sparkline (or the close
// button) hides it. A different sparkline swaps the metric in place.
//
// Note: clicks on a sparkline only synthesise correctly when the SVG
// elements survive across re-renders — see dash-sparkline._mount() for
// the why.
import { els } from './els.js';
import { state } from './connect.js';

// One row per metric. `spark` is the els[] key for the sparkline host;
// the rest are forwarded to <dash-plot> verbatim when this metric
// becomes the active one.
const METRICS = [
  { key: 'pos',   spark: 'sPos',       label: 'Position',     unit: 'ticks'   },
  { key: 'vel',   spark: 'sVel',       label: 'Velocity',     unit: 'ticks/s' },
  { key: 'iq',    spark: 'sIq',        label: 'Current (Iq)', unit: 'A'       },
  { key: 'ibus',  spark: 'ibusSpark',  label: 'Bus current',  unit: 'A'       },
  { key: 'power', spark: 'powerSpark', label: 'Power',        unit: 'W'       },
];

export function bindPlotToggles() {
  const host = els.plotHost;
  const plot = els.plot;
  if (!host || !plot) return;

  for (const m of METRICS) {
    const spark = els[m.spark];
    if (!spark) continue;
    spark.style.cursor = 'pointer';
    spark.title = `Open ${m.label} plot`;
    spark.setAttribute('role', 'button');
    spark.setAttribute('tabindex', '0');
    spark.setAttribute('aria-label', `Open ${m.label} plot`);
    const onActivate = () => focusMetric(m);
    spark.addEventListener('click', onActivate);
    spark.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); }
    });
  }

  plot.addEventListener('close', closePlot);
}

/* Show the plot for `m`. If it's already showing for the same metric,
   close it (toggle behaviour). */
function focusMetric(m) {
  if (state.activePlotKey === m.key) { closePlot(); return; }
  state.activePlotKey = m.key;
  const plot = els.plot;
  plot.label = m.label;
  plot.unit  = m.unit;
  plot.color = 'var(--accent)';
  plot.update(state.buffers[m.key]);
  els.plotHost.hidden = false;
  // Re-trigger the appearance animation when swapping metrics.
  els.plotHost.classList.remove('appear');
  void els.plotHost.offsetWidth;
  els.plotHost.classList.add('appear');
}

function closePlot() {
  state.activePlotKey = null;
  els.plotHost.hidden = true;
  els.plotHost.classList.remove('appear');
}
