// <tm-state-buttons> / <tm-mode-buttons> — vertical stack of full-width
// buttons. Identical render logic, two custom-element names so the markup
// reads naturally. Emits 'change' { detail: option } when the user clicks
// a non-active option.
import { Base } from './base.js';

class SegButtons extends Base {
  static defaults = { options: [], value: '', disabled: false };
  static get observedAttributes() { return ['value']; }
  attributeChangedCallback(n, _, v) {
    if (v === null) return;
    this._set(n, v);
  }
  set options(v) { this._set('options', Array.isArray(v) ? v : []); }
  get options() { return this._state.options; }
  set value(v)   { this._set('value', String(v ?? '')); }
  get value()    { return this._state.value; }
  set disabled(v){ this._set('disabled', !!v); }
  get disabled() { return this._state.disabled; }
  _render() {
    const { options, value, disabled } = this._state;
    const buttons = options.map(opt => {
      const active = (opt === value);
      return `<button data-opt="${opt}" data-active="${active}"
                ${disabled ? 'disabled' : ''}>${opt.replace(/_/g, ' ')}</button>`;
    }).join('');
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; flex-direction: column; gap: 6px; }
        button {
          background: var(--surface);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 9px 12px;
          font: inherit; font-size: 13px; font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          text-align: center;
        }
        button:hover:not([disabled]) { background: var(--accent); color: white; border-color: var(--accent); }
        button[data-active="true"] {
          background: var(--accent); color: white; border-color: var(--accent);
          font-weight: 600;
        }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
      </style>
      ${buttons}`;
    this.shadowRoot.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        if (disabled) return;
        const opt = b.dataset.opt;
        if (opt === this._state.value) return;
        this.dispatchEvent(new CustomEvent('change', { detail: opt, bubbles: true }));
      });
    });
  }
}

customElements.define('tm-state-buttons', class extends SegButtons {});
customElements.define('tm-mode-buttons',  class extends SegButtons {});
