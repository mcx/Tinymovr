// <tm-device-tile> — compact card summarising one heartbeating Tinymovr.
// Used in the All-devices grid view. Click / Enter / Space dispatches a
// bubbling `focus-device` CustomEvent with `{ nodeId }` so the parent
// can switch the picker to that node and route to the Inspector.
//
// Mount-once, update-only render (same pattern as dash-plot) so the
// tile stays click-able under a 1–2 Hz polling refresh.
import { Base, prop } from './base.js';

class DeviceTile extends Base {
  static defaults = {
    nodeId: null,
    version: '',
    state: '—',
    mode: '—',
    pos: NaN,
    vel: NaN,
    iq: NaN,
    ok: true,
    // null = unknown (no reading yet); false = needs calibration; true = calibrated.
    // The tile dot uses a tri-state tone derived from (ok, calibrated):
    //   bad  — any error bit set
    //   info — no errors but firmware reports !calibrated
    //   good — no errors and calibrated (or unknown, until the first poll)
    calibrated: null,
    connecting: true,
  };

  _fmt(v, digits) {
    if (!Number.isFinite(v)) return '—';
    return v.toFixed(digits);
  }

  _mount() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block; color: inherit;
          background: var(--surface);
          border-radius: 16px;
          padding: 18px 20px;
          box-shadow: var(--shadow);
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease,
                      border-color 0.12s ease;
          border: 1px solid transparent;
        }
        :host(:hover) {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
        }
        :host(:focus-visible) {
          outline: none;
          border-color: var(--accent);
        }
        .head {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 12px;
        }
        .id {
          font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
        }
        .ver {
          font-family: var(--num-font);
          font-size: 11px; opacity: 0.5;
        }
        .spacer { flex: 1; }
        .dot {
          width: 10px; height: 10px; border-radius: 999px;
          background: var(--tone, var(--good));
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--tone, var(--good)) 18%, transparent);
          transition: background 0.15s, box-shadow 0.15s;
        }
        .dot[data-tone="good"] { --tone: var(--good); }
        .dot[data-tone="info"] { --tone: var(--accent); }
        .dot[data-tone="bad"]  { --tone: var(--down); }
        .pills {
          display: flex; gap: 6px;
          margin-bottom: 14px;
        }
        .pill {
          padding: 3px 9px; border-radius: 999px;
          background: color-mix(in srgb, currentColor 8%, transparent);
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.06em; text-transform: uppercase;
          opacity: 0.85;
        }
        .rows {
          display: grid;
          grid-template-columns: auto 1fr auto;
          column-gap: 10px; row-gap: 8px;
          align-items: baseline;
          padding-top: 12px;
          border-top: 1px solid var(--border);
        }
        .l {
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          opacity: 0.55;
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
          font-size: 11px; opacity: 0.5;
        }
        .stale { opacity: 0.55; }
      </style>
      <div class="head">
        <span class="id" data-id></span>
        <span class="ver" data-ver></span>
        <span class="spacer"></span>
        <span class="dot" data-dot title="Status"></span>
      </div>
      <div class="pills">
        <span class="pill" data-state>—</span>
        <span class="pill" data-mode>—</span>
      </div>
      <div class="rows">
        <span class="l">Pos</span><span class="v" data-pos>—</span><span class="u">ticks</span>
        <span class="l">Vel</span><span class="v" data-vel>—</span><span class="u">ticks/s</span>
        <span class="l">Iq</span> <span class="v" data-iq>—</span><span class="u">A</span>
      </div>
    `;
    const sr = this.shadowRoot;
    this._refs = {
      id:    sr.querySelector('[data-id]'),
      ver:   sr.querySelector('[data-ver]'),
      dot:   sr.querySelector('[data-dot]'),
      state: sr.querySelector('[data-state]'),
      mode:  sr.querySelector('[data-mode]'),
      pos:   sr.querySelector('[data-pos]'),
      vel:   sr.querySelector('[data-vel]'),
      iq:    sr.querySelector('[data-iq]'),
    };
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
    if (!this.hasAttribute('role')) this.setAttribute('role', 'button');
    if (!this._handler) {
      this._handler = () => {
        if (this._state.nodeId == null) return;
        this.dispatchEvent(new CustomEvent('focus-device', {
          detail: { nodeId: this._state.nodeId },
          bubbles: true,
        }));
      };
      this.addEventListener('click', this._handler);
      this.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._handler();
        }
      });
    }
  }

  _render() {
    if (!this._refs) this._mount();
    const r = this._refs;
    const s = this._state;
    r.id.textContent  = s.nodeId == null ? '—' : `Node ${s.nodeId}`;
    r.ver.textContent = s.version || '';
    r.state.textContent = s.state || '—';
    r.mode.textContent  = s.mode  || '—';
    r.pos.textContent = this._fmt(s.pos, 2);
    r.vel.textContent = this._fmt(s.vel, 2);
    r.iq.textContent  = this._fmt(s.iq, 3);
    // Tri-state tone: errors dominate, otherwise an uncalibrated device is
    // surfaced in info-blue. `calibrated === null` (no reading yet) is
    // intentionally treated as good so freshly added tiles don't briefly
    // flash blue before the first slow-poll cycle resolves.
    let tone, title;
    if (!s.ok) {
      tone = 'bad';
      title = 'Errors active';
    } else if (s.calibrated === false) {
      tone = 'info';
      title = 'No errors · Not calibrated';
    } else {
      tone = 'good';
      title = s.calibrated === true ? 'No errors · Calibrated' : 'No errors';
    }
    r.dot.dataset.tone = tone;
    r.dot.title = title;
    this.classList.toggle('stale', !!s.connecting);
    this.setAttribute('aria-label',
      s.nodeId == null ? 'Device tile' : `Inspect node ${s.nodeId}`);
  }
}

['nodeId', 'version', 'state', 'mode', 'pos', 'vel', 'iq', 'ok', 'calibrated', 'connecting']
  .forEach(k => prop(DeviceTile, k));
customElements.define('tm-device-tile', DeviceTile);
