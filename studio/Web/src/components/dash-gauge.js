// <dash-gauge> — semicircular SVG gauge (270° sweep) with optional thresholds.
import { Base, prop, arcPath } from './base.js';

class Gauge extends Base {
  static defaults = { value: 0, min: 0, max: 100, label: '', warn: '', danger: '' };
  static get observedAttributes() { return ['value', 'min', 'max', 'label', 'warn', 'danger']; }
  attributeChangedCallback(n, _, v) {
    if (v === null) return;
    if (['value', 'min', 'max', 'warn', 'danger'].includes(n)) this._set(n, +v);
    else this._set(n, v);
  }
  _render() {
    let { value, min, max, label, warn, danger } = this._state;
    const r = 50, cx = 60, cy = 60;
    const startAng = -135, endAng = 135;
    const total = endAng - startAng;
    const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
    const cur = startAng + t * total;
    const stroke =
      (danger && value >= +danger) ? 'var(--down)' :
      (warn && value >= +warn) ? 'var(--warn)' :
      'var(--accent)';
    const display = Number.isFinite(value) ? value.toFixed(1) : '—';
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; max-width: 220px; margin: 0 auto; }
        svg { display: block; width: 100%; height: auto; }
        .v {
          font-family: var(--num-font);
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.01em;
          fill: var(--text);
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum" 1;
        }
        .l { font-size: 11px; opacity: 0.6; fill: var(--text); text-transform: uppercase; letter-spacing: 0.06em; }
      </style>
      <svg viewBox="0 0 120 120">
        <path d="${arcPath(cx, cy, r, startAng, endAng)}" stroke="var(--bar)" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="${arcPath(cx, cy, r, startAng, cur)}" stroke="${stroke}" stroke-width="6" fill="none" stroke-linecap="round"/>
        <text class="v" text-anchor="middle" x="60" y="62">${display}</text>
        <text class="l" text-anchor="middle" x="60" y="80">${label}</text>
      </svg>`;
  }
}

['value', 'min', 'max', 'label', 'warn', 'danger'].forEach(k => prop(Gauge, k));
customElements.define('dash-gauge', Gauge);
