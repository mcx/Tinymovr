// <dash-sparkline> — minimalist single-line trace. Set `.values` to an
// array of numbers; the component re-renders only on reference change
// (Base._set's strict-equality check), so reuse fresh arrays per update.
//
// IMPORTANT: we mount the SVG/path once and only update the `d` attribute
// thereafter. Re-creating the path on every value update destroys the
// node the browser is tracking for mousedown→mouseup pairing, which
// silently suppresses synthesised `click` events on the host. Keeping the
// element identity stable lets clicks fire normally.
import { Base, prop, smoothPath, tryJSON } from './base.js';

const W = 100, H = 30;

class Sparkline extends Base {
  static defaults = { values: [], color: 'currentColor' };
  static get observedAttributes() { return ['values', 'color']; }
  attributeChangedCallback(n, _, v) {
    if (v === null) return;
    if (n === 'values') this._set('values', tryJSON(v, []));
    else this._set('color', v);
  }

  _mount() {
    if (this._path) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; height: 100%; min-height: 24px; }
        /* pointer-events: all so the whole bounding box is a click
           target, not just the 1.5px stroke. */
        svg  { display: block; width: 100%; height: 100%; overflow: visible;
               pointer-events: all; }
        path { pointer-events: none; }
      </style>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <path fill="none" stroke-width="1.5" stroke-linecap="round"
              stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      </svg>`;
    this._path = this.shadowRoot.querySelector('path');
  }

  _render() {
    this._mount();
    const { values, color } = this._state;
    if (!values.length) { this._path.removeAttribute('d'); return; }
    const max = Math.max(...values), min = Math.min(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => ({
      x: (i / (values.length - 1 || 1)) * W,
      y: H - ((v - min) / range) * (H - 4) - 2,
    }));
    this._path.setAttribute('d', smoothPath(pts));
    this._path.setAttribute('stroke', color);
  }
}

['values', 'color'].forEach(k => prop(Sparkline, k));
customElements.define('dash-sparkline', Sparkline);
