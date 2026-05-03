// <dash-plot> — full-width time-series plot with axes, time-window
// selector, and live min/max/avg readouts. Fed externally via .update():
//
//   plot.update({ ts: number[], v: number[] })   // wall-clock ms since epoch
//
// Emits a 'close' CustomEvent when the user clicks the close button.
//
// IMPORTANT: like dash-sparkline, this component mounts the static
// chrome (header + SVG skeleton) exactly once and only patches the
// dynamic bits (path `d`, axis labels, stat numbers) on each tick.
// Re-rendering the whole shadow DOM at 20 Hz would tear down the
// `<select>` element mid-interaction and instantly close any open
// dropdown — exactly the bug we hit before this refactor.
import { Base, prop } from './base.js';

const WINDOWS = [
  { ms: 5_000,   label: '5s'  },
  { ms: 15_000,  label: '15s' },
  { ms: 60_000,  label: '1m'  },
  { ms: 300_000, label: '5m'  },
];

// Drawing constants (viewBox units; SVG scales responsively).
const W = 1200, H = 320;
const padL = 64, padR = 24, padT = 12, padB = 30;
const innerW = W - padL - padR;
const innerH = H - padT - padB;
const N_Y = 5, N_X = 6;

class Plot extends Base {
  static defaults = {
    label: '', unit: '', color: 'var(--accent)',
    // Default to a value that exists in WINDOWS so the <select>
    // initialises to a real option rather than rendering blank.
    windowMs: 15_000,
  };
  static get observedAttributes() {
    return ['label', 'unit', 'color', 'window-ms'];
  }
  attributeChangedCallback(n, _, v) {
    if (v === null) return;
    if (n === 'window-ms') this._set('windowMs', +v || 15_000);
    else this._set(n, v);
  }
  set windowMs(v) { this._set('windowMs', +v || 15_000); }
  get windowMs() { return this._state.windowMs; }

  /* External data feed. We keep a reference to the latest series and
     render coalesces through Base._schedule(). The series itself is
     owned by the caller (state.buffers[path]) and never mutated here. */
  update(series) {
    this._series = series || null;
    this._schedule();
  }

  _slice() {
    const s = this._series;
    if (!s || !s.v?.length) return null;
    const cutoff = performance.now() - this._state.windowMs;
    let i = 0;
    while (i < s.ts.length && s.ts[i] < cutoff) i++;
    if (i === 0) return s;
    return { ts: s.ts.slice(i), v: s.v.slice(i) };
  }

  _fmt(v) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1000) return v.toFixed(0);
    if (a >= 100)  return v.toFixed(1);
    if (a >= 1)    return v.toFixed(2);
    return v.toFixed(3);
  }

  _fmtTimeAgo(ms) {
    if (ms <= 250) return 'now';
    if (ms < 1000)   return `−${(ms).toFixed(0)}ms`;
    if (ms < 60_000) return `−${(ms / 1000).toFixed(0)}s`;
    return `−${(ms / 60_000).toFixed(0)}m`;
  }

  _mount() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block; color: inherit;
          background: var(--surface);
          border-radius: 16px;
          padding: 20px 24px;
          box-shadow: var(--shadow);
        }
        .head {
          display: flex; align-items: baseline; gap: 18px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .title {
          font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
        }
        .title .unit { opacity: 0.5; font-weight: 500; margin-left: 6px; }
        .stats {
          display: flex; gap: 18px;
          font-family: var(--num-font); font-size: 12px;
          opacity: 0.9;
        }
        .stats .k {
          opacity: 0.5; margin-right: 6px;
          text-transform: uppercase; letter-spacing: 0.06em;
          font-size: 10px;
        }
        .stats b { font-weight: 700; font-variant-numeric: tabular-nums; }
        .spacer { flex: 1; }
        .ctl { display: flex; align-items: center; gap: 8px; }
        select, button {
          background: transparent; color: var(--text);
          border: 1px solid var(--border); border-radius: 8px;
          padding: 4px 10px; font: inherit; font-size: 12px;
          height: 30px; cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        button.close {
          padding: 0; width: 30px; line-height: 1; font-size: 16px;
          opacity: 0.7;
        }
        select:hover, button:hover {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 6%, transparent);
        }
        button.close:hover { opacity: 1; }
        .canvas { position: relative; }
        svg {
          display: block; width: 100%; height: auto;
          aspect-ratio: ${W} / ${H};
        }
        .grid line { stroke: var(--border); stroke-dasharray: 2 4; opacity: 0.7; }
        .baseline { stroke: var(--border); }
        .axis { font-family: var(--num-font); }
        .axis text {
          fill: var(--text); opacity: 0.55; font-size: 11px;
          font-variant-numeric: tabular-nums;
        }
        .x-axis text { text-anchor: middle; }
        .y-axis text { text-anchor: end; }
        .empty {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; opacity: 0.45;
          pointer-events: none;
        }
        /* Class-selector specificity outranks the UA [hidden] rule
           inside shadow DOM, so we have to spell it out. */
        .empty[hidden] { display: none; }
        path.trace { pointer-events: none; }
      </style>
      <div class="head">
        <span class="title"></span>
        <span class="stats">
          <span><span class="k">cur</span><b data-stat="cur">—</b></span>
          <span><span class="k">min</span><b data-stat="min">—</b></span>
          <span><span class="k">max</span><b data-stat="max">—</b></span>
          <span><span class="k">avg</span><b data-stat="avg">—</b></span>
        </span>
        <span class="spacer"></span>
        <span class="ctl">
          <select class="window" title="Time window" aria-label="Time window">
            ${WINDOWS.map(w =>
              `<option value="${w.ms}">${w.label}</option>`,
            ).join('')}
          </select>
          <button class="close" title="Close plot" aria-label="Close plot">×</button>
        </span>
      </div>
      <div class="canvas">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <g class="grid"></g>
          <line class="baseline"
                x1="${padL}" x2="${W - padR}"
                y1="${H - padB}" y2="${H - padB}"/>
          <g class="axis y-axis"></g>
          <g class="axis x-axis"></g>
          <path class="trace" fill="none" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"
                vector-effect="non-scaling-stroke"/>
        </svg>
        <div class="empty">awaiting samples…</div>
      </div>
    `;
    const sr = this.shadowRoot;
    this._refs = {
      title: sr.querySelector('.title'),
      cur:   sr.querySelector('[data-stat="cur"]'),
      min:   sr.querySelector('[data-stat="min"]'),
      max:   sr.querySelector('[data-stat="max"]'),
      avg:   sr.querySelector('[data-stat="avg"]'),
      sel:   sr.querySelector('select.window'),
      close: sr.querySelector('button.close'),
      grid:  sr.querySelector('g.grid'),
      yAxis: sr.querySelector('g.y-axis'),
      xAxis: sr.querySelector('g.x-axis'),
      path:  sr.querySelector('path.trace'),
      empty: sr.querySelector('.empty'),
    };
    this._refs.sel.addEventListener('change', e => {
      this.windowMs = +e.target.value;
    });
    this._refs.close.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
    });
  }

  _render() {
    if (!this._refs) this._mount();
    const r = this._refs;
    const { label, unit, color, windowMs } = this._state;

    // --- Header ----------------------------------------------------------
    r.title.innerHTML = (label || '')
      + (unit ? `<span class="unit">${unit}</span>` : '');
    // Only touch the select's value when it actually disagrees with state,
    // so that an open dropdown is not perturbed by polling-driven renders.
    if (+r.sel.value !== windowMs) r.sel.value = String(windowMs);

    // --- Series stats + path --------------------------------------------
    const sliced = this._slice();
    let pathD = '';
    let yMin = 0, yMax = 1;
    let cur = NaN, mn = NaN, mx = NaN, avg = NaN;

    if (sliced && sliced.v.length > 1) {
      const vs = sliced.v;
      mn = vs[0]; mx = vs[0]; let sum = 0;
      for (const v of vs) { if (v < mn) mn = v; if (v > mx) mx = v; sum += v; }
      avg = sum / vs.length;
      cur = vs[vs.length - 1];

      const span = mx - mn;
      const pad = span > 0 ? span * 0.1 : (Math.abs(mx) * 0.1 || 1);
      yMin = mn - pad;
      yMax = mx + pad;

      const tEnd = sliced.ts[sliced.ts.length - 1];
      const tStart = tEnd - windowMs;
      let d = '';
      for (let i = 0; i < vs.length; i++) {
        const x = padL + ((sliced.ts[i] - tStart) / windowMs) * innerW;
        const y = padT + (1 - (vs[i] - yMin) / (yMax - yMin || 1)) * innerH;
        d += (i ? ' L ' : 'M ') + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      pathD = d;
    }

    r.cur.textContent = this._fmt(cur);
    r.min.textContent = this._fmt(mn);
    r.max.textContent = this._fmt(mx);
    r.avg.textContent = this._fmt(avg);
    r.empty.hidden = !!pathD;
    if (pathD) r.path.setAttribute('d', pathD);
    else       r.path.removeAttribute('d');
    r.path.setAttribute('stroke', color);

    // --- Axes ------------------------------------------------------------
    let grid = '', yAxis = '';
    for (let i = 0; i < N_Y; i++) {
      const t = i / (N_Y - 1);
      const v = yMin + (yMax - yMin) * (1 - t);
      const y = padT + t * innerH;
      grid  += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"/>`;
      yAxis += `<text x="${padL - 8}" y="${y + 4}">${this._fmt(v)}</text>`;
    }
    r.grid.innerHTML  = grid;
    r.yAxis.innerHTML = yAxis;

    let xAxis = '';
    for (let i = 0; i < N_X; i++) {
      const t = i / (N_X - 1);
      const ms = (1 - t) * windowMs;
      const x = padL + t * innerW;
      xAxis += `<text x="${x}" y="${H - padB + 18}">${this._fmtTimeAgo(ms)}</text>`;
    }
    r.xAxis.innerHTML = xAxis;
  }
}

['label', 'unit', 'color'].forEach(k => prop(Plot, k));
customElements.define('dash-plot', Plot);
