// Shared helpers and the Base web-component class used by every <dash-*>
// and <tm-*> custom element. Mirrors the Webcomponents-dashboard pattern
// (rAF-coalesced renders, reference-equality state dedup).

export const $ = sel => document.querySelector(sel);
export const tryJSON = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

export function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  const T = 0.2;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) * T;
    const c1y = p1.y + (p2.y - p0.y) * T;
    const c2x = p2.x - (p3.x - p1.x) * T;
    const c2y = p2.y - (p3.y - p1.y) * T;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function polarToCart(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
export function arcPath(cx, cy, r, startDeg, endDeg) {
  const start = polarToCart(cx, cy, r, startDeg);
  const end = polarToCart(cx, cy, r, endDeg);
  const sweep = endDeg - startDeg;
  const large = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

let _uid = 0;
export const uid = () => `u${++_uid}`;
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export class Base extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._state = { ...this.constructor.defaults };
    this._raf = 0;
    this._uid = uid();
  }
  static defaults = {};
  connectedCallback() { this._schedule(); }
  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._render();
    });
  }
  _set(key, val) {
    if (this._state[key] === val) return;
    this._state[key] = val;
    this._schedule();
  }
  _render() {}
}

export function prop(cls, key) {
  Object.defineProperty(cls.prototype, key, {
    get() { return this._state[key]; },
    set(v) { this._set(key, v); },
  });
}
