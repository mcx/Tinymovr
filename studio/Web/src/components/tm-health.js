// <tm-health> — compact device health summary. Renders one row per channel:
//   label on the left,
//   "✓ OK" on the right when no bits are set, or
//   the active flag names (in tone color) when something is wrong.
// API:
//   .channels = [{ key, label, tone: 'bad'|'warn', flags: [...] }, ...]
//   .setValue(key, bitmask)
import { Base } from './base.js';

const CHECK_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

class Health extends Base {
  static defaults = { channels: [], _values: {} };
  set channels(v) {
    const next = Array.isArray(v) ? v : [];
    if (next === this._state.channels) return;
    this._state.channels = next;
    this._state._values = {};
    this._schedule();
  }
  get channels() { return this._state.channels; }
  setValue(key, n) {
    const v = +n || 0;
    if (this._state._values[key] === v) return;
    this._state._values = { ...this._state._values, [key]: v };
    this._schedule();
  }
  _render() {
    const { channels, _values } = this._state;
    const rows = channels.map(ch => {
      const val = _values[ch.key] | 0;
      const items = [];
      for (let i = 0; i < ch.flags.length; i++) {
        if ((val >> i) & 1) items.push(ch.flags[i]);
      }
      const status = items.length
        ? `<span class="s ${ch.tone}">${
            items.map(f => `<span>${f.replace(/_/g, ' ')}</span>`).join('')
          }</span>`
        : `<span class="s ok">${CHECK_SVG}<span>OK</span></span>`;
      return `<div class="row"><span class="l">${ch.label}</span>${status}</div>`;
    }).join('');
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; flex-direction: column; color: inherit; }
        .row {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 12px; padding: 7px 0;
          font-size: 11px; line-height: 1.4;
        }
        .row + .row { border-top: 1px solid var(--border); }
        .l {
          opacity: 0.6; font-weight: 500;
          text-transform: uppercase; letter-spacing: 0.04em;
          flex-shrink: 0;
        }
        .s { font-weight: 600; }
        .s.ok {
          display: inline-flex; align-items: center; gap: 4px;
          color: var(--good);
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .s.bad, .s.warn {
          display: flex; flex-direction: column; align-items: flex-end;
          gap: 2px; min-width: 0;
          text-align: right; word-break: break-word;
        }
        .s.bad  { color: var(--down); }
        .s.warn { color: var(--warn); }
      </style>
      ${rows}`;
  }
}

customElements.define('tm-health', Health);
