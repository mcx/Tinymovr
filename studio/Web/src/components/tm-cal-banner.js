// <tm-cal-banner> — guided calibration UX. Shows a single banner that
// follows the controller through the CALIBRATE → IDLE transition and
// reports the outcome with friendly copy.
//
// Phases:
//   'running'  motor is being calibrated (~10 s); pulse + elapsed timer
//   'success'  controller returned to IDLE without raising new errors;
//              one-click "Enter CL_CONTROL" surfaces here
//   'error'    new error bits appeared during calibration; each is rendered
//              with a human-readable hint (see app/calibration.js for the map)
//   'timeout'  set state never observed transitioning into CALIBRATE within
//              the watchdog window — usually the firmware refused (existing
//              error, undervoltage, …)
//
// Pure presentation: the parent (app/calibration.js) owns the state machine,
// drives this component via setters and listens for two events:
//   - 'enter-cl'   user clicked "Enter CL_CONTROL"
//   - 'dismiss'    user clicked the close button
import { Base } from './base.js';

const ICONS = {
  spinner: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
         stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <path d="M12 3 a9 9 0 0 1 9 9" opacity="0.9"/>
      <path d="M3 12 a9 9 0 0 0 9 9" opacity="0.35"/>
    </svg>`,
  check: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
         stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`,
  alert: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
         stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3 L22 20 L2 20 Z"/>
      <line x1="12" y1="10" x2="12" y2="14"/>
      <circle cx="12" cy="17" r="0.6" fill="currentColor"/>
    </svg>`,
  close: `
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
         stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <line x1="6" y1="6" x2="18" y2="18"/>
      <line x1="18" y1="6" x2="6" y2="18"/>
    </svg>`,
};

class CalBanner extends Base {
  static defaults = {
    phase: 'hidden',     // hidden | running | success | error | timeout
    elapsedMs: 0,
    errors: [],          // [{ flag, message }]
    canEnterCl: false,
  };

  set phase(v)        { this._set('phase', v); }
  get phase()         { return this._state.phase; }
  set elapsedMs(v)    { this._set('elapsedMs', +v || 0); }
  get elapsedMs()     { return this._state.elapsedMs; }
  set errors(v)       { this._set('errors', Array.isArray(v) ? v.slice() : []); }
  get errors()        { return this._state.errors; }
  set canEnterCl(v)   { this._set('canEnterCl', !!v); }
  get canEnterCl()    { return this._state.canEnterCl; }

  _render() {
    const { phase, elapsedMs, errors, canEnterCl } = this._state;
    if (phase === 'hidden') {
      this.shadowRoot.innerHTML = '';
      this.hidden = true;
      this._lastSig = null;
      return;
    }
    this.hidden = false;

    // Structural signature: anything that affects DOM layout. The elapsed
    // timer is intentionally excluded so per-second ticks don't rebuild
    // the shadow tree (which would re-trigger the slide-in animation and
    // make the whole banner appear to flicker once a second).
    const sig = phase + '|' + canEnterCl + '|' + errors.map(e => e.flag).join(',');
    if (sig === this._lastSig) {
      const el = this.shadowRoot.querySelector('.elapsed');
      if (el && phase === 'running') el.textContent = `${Math.round(elapsedMs / 1000)}s`;
      return;
    }
    this._lastSig = sig;

    let tone, icon, title, body;
    if (phase === 'running') {
      tone = 'info';
      icon = ICONS.spinner;
      title = 'Calibrating motor…';
      const sec = Math.round(elapsedMs / 1000);
      body = `Measuring phase resistance, inductance, and pole pairs. `
           + `This usually takes about 10 seconds — the shaft will move and may emit a brief clicking sound. `
           + `<span class="elapsed">${sec}s</span>`;
    } else if (phase === 'success') {
      tone = 'good';
      icon = ICONS.check;
      title = 'Calibration complete';
      body = 'The motor and sensor are calibrated. The controller is back in <strong>IDLE</strong>; '
           + 'enter <strong>CL_CONTROL</strong> to start commanding setpoints.';
    } else if (phase === 'timeout') {
      tone = 'warn';
      icon = ICONS.alert;
      title = 'Calibration didn\u2019t start';
      body = 'The controller never reported a CALIBRATE state. This usually means an error is already '
           + 'set — review the Health card and clear the underlying issue (e.g. undervoltage, gate-driver '
           + 'fault) before trying again.';
    } else {
      tone = 'bad';
      icon = ICONS.alert;
      title = errors.length === 1
        ? 'Calibration failed'
        : `Calibration failed (${errors.length} issues)`;
      body = 'The controller is back in <strong>IDLE</strong>. Resolve the issues below, then click '
           + '<strong>CALIBRATE</strong> again.';
    }

    const errorList = errors.length
      ? `<ul class="errs">${errors.map(e =>
          `<li><code>${e.flag}</code><span>${e.message}</span></li>`,
        ).join('')}</ul>`
      : '';

    const ctaBtn = (phase === 'success' && canEnterCl)
      ? `<button class="cta" data-act="enter-cl">Enter CL_CONTROL</button>`
      : '';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-bottom: 16px;
          --tone-info: var(--accent);
          --tone-good: var(--good);
          --tone-warn: var(--warn);
          --tone-bad:  var(--down);
        }
        .wrap {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 14px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-left: 4px solid var(--tone);
          border-radius: 12px;
          box-shadow: var(--shadow);
          animation: slide-in 220ms ease-out;
        }
        :host([data-tone="info"]) .wrap { --tone: var(--tone-info); }
        :host([data-tone="good"]) .wrap { --tone: var(--tone-good); }
        :host([data-tone="warn"]) .wrap { --tone: var(--tone-warn); }
        :host([data-tone="bad"])  .wrap { --tone: var(--tone-bad);  }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .icon {
          flex: 0 0 auto;
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px;
          border-radius: 50%;
          background: color-mix(in srgb, var(--tone) 14%, transparent);
          color: var(--tone);
        }
        .icon.spin svg { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .body { flex: 1 1 auto; min-width: 0; }
        .title {
          font-size: 14px; font-weight: 600;
          margin: 0 0 4px;
          letter-spacing: -0.01em;
        }
        .msg {
          margin: 0;
          font-size: 13px; line-height: 1.45;
          opacity: 0.85;
        }
        .msg strong { color: var(--text); opacity: 1; }
        .elapsed {
          display: inline-block;
          margin-left: 8px;
          padding: 1px 8px;
          border-radius: 999px;
          font: 11px var(--num-font);
          font-variant-numeric: tabular-nums;
          background: color-mix(in srgb, var(--tone) 14%, transparent);
          color: var(--tone);
          font-weight: 600;
        }
        .errs {
          list-style: none;
          margin: 10px 0 0;
          padding: 0;
          display: flex; flex-direction: column; gap: 6px;
        }
        .errs li {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 8px 10px;
          background: var(--pre-bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 12px; line-height: 1.45;
        }
        .errs code {
          flex: 0 0 auto;
          font: 11px var(--num-font);
          padding: 2px 6px;
          border-radius: 4px;
          background: color-mix(in srgb, var(--tone-bad) 14%, transparent);
          color: var(--tone-bad);
          font-weight: 600;
          letter-spacing: 0.02em;
          white-space: nowrap;
          max-width: 40%;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .errs span { flex: 1 1 auto; opacity: 0.9; }
        .actions {
          flex: 0 0 auto;
          display: flex; align-items: flex-start; gap: 6px;
        }
        .cta {
          background: var(--tone);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 8px 14px;
          font: inherit; font-size: 13px; font-weight: 600;
          cursor: pointer;
          transition: filter 0.15s;
        }
        .cta:hover { filter: brightness(1.08); }
        .close {
          background: transparent;
          color: var(--text);
          opacity: 0.55;
          border: none;
          width: 26px; height: 26px;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          transition: opacity 0.15s, background 0.15s;
        }
        .close:hover { opacity: 1; background: color-mix(in srgb, currentColor 8%, transparent); }
      </style>
      <div class="wrap">
        <div class="icon ${phase === 'running' ? 'spin' : ''}">${icon}</div>
        <div class="body">
          <h3 class="title">${title}</h3>
          <p class="msg">${body}</p>
          ${errorList}
        </div>
        <div class="actions">
          ${ctaBtn}
          <button class="close" data-act="dismiss" title="Dismiss">${ICONS.close}</button>
        </div>
      </div>`;

    this.dataset.tone = tone;

    this.shadowRoot.querySelectorAll('button[data-act]').forEach(b => {
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        this.dispatchEvent(new CustomEvent(act, { bubbles: true }));
      });
    });
  }
}

customElements.define('tm-cal-banner', CalBanner);
