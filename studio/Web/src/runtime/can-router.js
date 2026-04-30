// CanRouter — dispatches inbound frames to registered listeners. Each
// listener provides a synchronous filter (called per frame) and a
// callback. Returns an unsubscribe function.
export class CanRouter {
  constructor() { this._listeners = []; }
  add(filter, callback) {
    const entry = { filter, callback };
    this._listeners.push(entry);
    return () => {
      const i = this._listeners.indexOf(entry);
      if (i >= 0) this._listeners.splice(i, 1);
    };
  }
  dispatch(frame) {
    for (const l of this._listeners) {
      try { if (l.filter(frame)) l.callback(frame); }
      catch (e) { console.warn('Router listener threw', e); }
    }
  }
}
