// <dash-stat> — label on top; sparkline on the left and big number on
// the right of the main row. The slot accepts a single inline element
// (typically <dash-sparkline>) and is sized to match the value height
// so the row reads as a compact telemetry strip.
import { Base, prop } from './base.js';

class Stat extends Base {
  static defaults = { label: '', value: '—', unit: '', delta: '', trend: '', minChars: 0 };
  static get observedAttributes() { return ['label', 'value', 'unit', 'delta', 'trend', 'min-chars']; }
  attributeChangedCallback(n, _, v) {
    if (v === null) return;
    if (n === 'min-chars') this._set('minChars', +v || 0);
    else this._set(n, v);
  }
  _render() {
    const { label, value, unit, delta, trend, minChars } = this._state;
    const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
    const c = trend === 'up' ? 'var(--up)' : trend === 'down' ? 'var(--down)' : 'currentColor';
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; color: inherit; }
        .head {
          display: flex; justify-content: space-between; align-items: center;
          gap: 12px; margin-bottom: 6px;
        }
        .label { font-size: 11px; opacity: 0.6; line-height: 1.3; text-transform: uppercase; letter-spacing: 0.04em; }
        .pill {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 4px 8px; border-radius: 999px;
          background: color-mix(in srgb, ${c} 12%, transparent); color: ${c};
          font-size: 12px; font-weight: 600; line-height: 1; white-space: nowrap;
        }
        .main {
          display: flex; align-items: flex-end; gap: 16px;
        }
        .spark {
          flex: 1 1 0; min-width: 0;
          display: flex; align-items: flex-end;
          height: 36px;
          opacity: 0.65;
        }
        ::slotted(*) { width: 100%; }
        .value {
          flex: 0 0 auto;
          text-align: right;
          font-family: var(--num-font);
          font-size: 36px;
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum" 1;
          white-space: nowrap;
        }
        .num {
          display: inline-block;
          text-align: right;
          ${minChars > 0 ? `min-width: ${minChars}ch;` : ''}
        }
        .unit {
          font-family: var(--num-font);
          font-size: 14px;
          font-weight: 700;
          opacity: 0.55;
          margin-left: 6px;
          letter-spacing: 0;
        }
      </style>
      <div class="head">
        <span class="label">${label}</span>
        ${delta ? `<span class="pill">${arrow} ${delta}</span>` : ''}
      </div>
      <div class="main">
        <div class="spark"><slot></slot></div>
        <span class="value"><span class="num">${value}</span>${unit ? `<span class="unit">${unit}</span>` : ''}</span>
      </div>`;
  }
}

['label', 'value', 'unit', 'delta', 'trend', 'minChars'].forEach(k => prop(Stat, k));
customElements.define('dash-stat', Stat);
