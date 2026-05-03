// <dash-card> — rounded container with optional title, padding, accent.
import { Base, prop } from './base.js';

class Card extends Base {
  static defaults = { title: '', accent: '', padding: '20px', titleDivider: false };
  static get observedAttributes() { return ['title', 'accent', 'padding', 'title-divider']; }
  attributeChangedCallback(n, _, v) {
    if (n === 'title-divider') {
      this._set('titleDivider', v !== null);
      return;
    }
    if (v !== null) this._set(n, v);
  }
  _render() {
    const { title, accent, padding, titleDivider } = this._state;
    const bg = accent || 'var(--surface)';
    const fg = accent ? '#ffffff' : 'var(--text)';
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .card {
          background: ${bg}; color: ${fg};
          border-radius: 16px;
          padding: ${padding};
          box-shadow: var(--shadow);
          height: 100%;
          box-sizing: border-box;
          display: flex; flex-direction: column; gap: 16px;
        }
        .title { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; margin: 0; opacity: 0.85; }
        .title-divider {
          height: 1px;
          background: var(--border);
          opacity: 0.7;
          margin: -4px 0 2px;
        }
      </style>
      <div class="card">
        ${title ? `<h3 class="title">${title}</h3>` : ''}
        ${title && titleDivider ? '<div class="title-divider"></div>' : ''}
        <slot></slot>
      </div>`;
  }
}

['title', 'accent', 'padding', 'titleDivider'].forEach(k => prop(Card, k));
customElements.define('dash-card', Card);
