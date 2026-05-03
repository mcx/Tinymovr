// <tm-setpoint> — label + value + jog −/+ buttons + numeric input.
// Emits:
//   'change' { detail: number }   — committed value (Enter or blur)
//   'jog'    { detail: number }   — incremental delta (uses `step`)
import { Base } from './base.js';

class Setpoint extends Base {
  static defaults = {
    label: '', unit: '', value: NaN, step: 1, precision: null, active: false, disabled: false, flat: false,
  };
  static get observedAttributes() { return ['label', 'unit', 'value', 'step', 'precision', 'active', 'disabled', 'flat']; }
  attributeChangedCallback(n, _, v) {
    if (v === null) return;
    if (n === 'value' || n === 'step' || n === 'precision') this._set(n, +v);
    else if (n === 'active' || n === 'disabled' || n === 'flat') this._set(n, v === 'true' || v === '');
    else this._set(n, v);
  }
  set value(v) { this._set('value', +v); }
  get value() { return this._state.value; }
  set step(v) { this._set('step', +v || 1); }
  get step() { return this._state.step; }
  set precision(v) { this._set('precision', Number.isFinite(+v) ? +v : null); }
  get precision() { return this._state.precision; }
  set unit(v) { this._set('unit', v); }
  get unit() { return this._state.unit; }
  set active(v) { this._set('active', !!v); }
  get active() { return this._state.active; }
  set disabled(v) { this._set('disabled', !!v); }
  get disabled() { return this._state.disabled; }
  set flat(v) { this._set('flat', !!v); }
  get flat() { return this._state.flat; }
  set label(v) { this._set('label', v); }
  get label() { return this._state.label; }

  _commit(v) {
    if (this._state.disabled) return;
    if (!Number.isFinite(v)) return;
    this.dispatchEvent(new CustomEvent('change', { detail: v, bubbles: true }));
  }
  _jog(delta) {
    if (this._state.disabled) return;
    this.dispatchEvent(new CustomEvent('jog', { detail: delta, bubbles: true }));
  }

  _schedule() {
    // Preserve the user's in-flight typing: don't tear down the shadow DOM
    // while the input is focused. Pending state still resolves on blur.
    if (this._editing) { this._dirty = true; return; }
    super._schedule();
  }

  _render() {
    const { label, unit, value, step, precision, active, disabled, flat } = this._state;
    const digits = precision ?? (step >= 1 ? 0 : 4);
    const display = Number.isFinite(value) ? value.toFixed(digits) : '';
    // In flat mode we don't draw our own border or chrome — the parent card
    // supplies the framing. The active mode is still highlighted via a soft
    // accent tint + accent-tinted hairline so the eye still finds the row.
    const borderColor = flat
      ? (active ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'transparent')
      : 'var(--border)';
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; color: inherit; }
        .wrap {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 14px;
          align-items: center;
          padding: ${flat ? '7px 9px' : '10px 12px'};
          border-radius: 10px;
          border: 1px solid ${borderColor};
          background: ${active ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'color-mix(in srgb, currentColor 3%, transparent)'};
          opacity: ${disabled ? 0.5 : 1};
          transition: background 0.2s, border-color 0.2s;
        }
        .left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .label {
          font-size: 11px; opacity: 0.65;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .label .unit { opacity: 0.65; font-weight: 400; margin-left: 4px; }
        .label .badge {
          display: inline-block; margin-left: 8px;
          font-size: 9px; font-weight: 700; letter-spacing: 0.06em;
          color: var(--accent); padding: 1px 5px; border-radius: 3px;
          background: color-mix(in srgb, var(--accent) 14%, transparent);
        }
        .right {
          display: grid;
          grid-template-columns: 28px minmax(92px, 1fr) 28px;
          align-items: center;
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface);
        }
        .right:focus-within { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
        button, input {
          background: transparent;
          color: var(--text);
          border: 0;
          border-radius: 0;
          padding: 4px 10px;
          font: inherit; font-size: 13px;
          height: 30px;
        }
        input {
          width: 108px;
          text-align: right;
          font-family: var(--num-font);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum" 1;
          outline: none;
          cursor: text;
        }
        button { cursor: pointer; font-weight: 700; min-width: 28px; opacity: 0.75; }
        button + input, input + button { border-left: 1px solid var(--border); }
        button:hover:not([disabled]) { background: var(--accent); color: white; opacity: 1; }
        button:disabled, input:disabled { opacity: 0.5; cursor: not-allowed; }
      </style>
      <div class="wrap">
        <div class="left">
          <span class="label">
            ${label}<span class="unit">${unit ? `(${unit})` : ''}</span>
            ${active ? '<span class="badge">ACTIVE</span>' : ''}
          </span>
        </div>
        <div class="right">
          <button data-act="dec" ${disabled ? 'disabled' : ''} title="Jog −${step}">−</button>
          <input type="number" step="${step}" value="${display}" ${disabled ? 'disabled' : ''}>
          <button data-act="inc" ${disabled ? 'disabled' : ''} title="Jog +${step}">+</button>
        </div>
      </div>`;

    const input = this.shadowRoot.querySelector('input');
    input.addEventListener('focus', () => { this._editing = true; });
    input.addEventListener('blur', () => {
      this._editing = false;
      const v = parseFloat(input.value);
      if (Number.isFinite(v) && v !== this._state.value) this._commit(v);
      if (this._dirty) { this._dirty = false; this._schedule(); }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') {
        input.value = display;
        input.blur();
      }
    });
    this.shadowRoot.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        const sign = b.dataset.act === 'inc' ? +1 : -1;
        this._jog(sign * step);
      });
    });
  }
}

customElements.define('tm-setpoint', Setpoint);
