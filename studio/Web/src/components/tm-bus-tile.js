// <tm-bus-tile> — accent-tinted summary card pinned at the top of the
// fleet grid. Shows the discovered device count and Vbus (sourced from
// whichever device is currently first in the multipoll runtime). Sized
// to mirror <tm-device-tile> so they line up cleanly in the same row.
import { Base, prop } from './base.js';

class BusTile extends Base {
  static defaults = { devices: 0, vbus: NaN };

  _fmt(v, digits) {
    return Number.isFinite(v) ? v.toFixed(digits) : '—';
  }

  _mount() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: var(--accent);
          color: #ffffff;
          border-radius: 16px;
          padding: 18px 20px;
          box-shadow: var(--shadow);
          height: 100%;
          box-sizing: border-box;
        }
        .head {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 12px;
        }
        .title {
          font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
        }
        .pills { display: flex; gap: 6px; margin-bottom: 14px; }
        .pill {
          padding: 3px 9px; border-radius: 999px;
          background: rgba(255, 255, 255, 0.18);
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.06em; text-transform: uppercase;
        }
        .rows {
          display: grid;
          grid-template-columns: auto 1fr auto;
          column-gap: 10px; row-gap: 8px;
          align-items: baseline;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.22);
        }
        .l {
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          opacity: 0.78;
        }
        .v {
          font-family: var(--num-font);
          font-size: 16px; font-weight: 700;
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum" 1;
          text-align: right;
        }
        .u {
          font-family: var(--num-font);
          font-size: 11px; opacity: 0.7;
        }
      </style>
      <div class="head"><span class="title">Bus</span></div>
      <div class="pills"><span class="pill" data-status>CONNECTED</span></div>
      <div class="rows">
        <span class="l">Devices</span>
        <span class="v" data-devices>0</span>
        <span class="u"></span>
        <span class="l">Vbus</span>
        <span class="v" data-vbus>—</span>
        <span class="u">V</span>
      </div>
    `;
    const sr = this.shadowRoot;
    this._refs = {
      status:  sr.querySelector('[data-status]'),
      devices: sr.querySelector('[data-devices]'),
      vbus:    sr.querySelector('[data-vbus]'),
    };
  }

  _render() {
    if (!this._refs) this._mount();
    const r = this._refs;
    const s = this._state;
    r.devices.textContent = String(s.devices | 0);
    r.vbus.textContent = this._fmt(s.vbus, 2);
  }
}

['devices', 'vbus'].forEach(k => prop(BusTile, k));
customElements.define('tm-bus-tile', BusTile);
