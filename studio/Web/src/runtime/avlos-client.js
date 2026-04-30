// AvlosClient — get/set/call by endpoint path. Single in-flight request,
// queued. Mirrors CANChannel.send/recv semantics from the Python client.
import { Codec } from './codec.js';
import {
  arbitrationFromIds, idsFromArbitration,
  HEARTBEAT_BASE, HEARTBEAT_MASK,
} from './can-id.js';

export class AvlosClient {
  constructor({ driver, router, nodeId, spec, discovery = null }) {
    this.driver = driver;
    this.router = router;
    this.nodeId = nodeId;
    this.spec = spec;
    this.discovery = discovery;
    this.byPath = new Map(spec.endpoints.map(ep => [ep.path, ep]));
    this._queue = Promise.resolve();
    // Listener: extended, non-RTR frames whose arb id decodes to our node_id.
    // Mirrors `_filter_frame` in studio/Python/tinymovr/channel.py. Exclude
    // heartbeat-shaped frames so e.g. a heartbeat from node 1 is never
    // mistaken for an avlos response when this client is bound to node 0.
    this._unsub = router.add(
      f => f.ext && !f.rtr
        && (f.id & HEARTBEAT_MASK) !== HEARTBEAT_BASE
        && idsFromArbitration(f.id).nodeId === nodeId,
      f => {
        // Any response counts as proof-of-life: continuous polling keeps
        // the device "alive" in discovery even though the firmware
        // suppresses heartbeats while answering requests.
        if (this.discovery) this.discovery.markAlive(this.nodeId);
        this._onFrame(f);
      },
    );
    this._inflight = null;
  }

  destroy() { try { this._unsub && this._unsub(); } catch (_) {} }

  ep(path) {
    const e = this.byPath.get(path);
    if (!e) throw new Error(`Endpoint '${path}' not found in spec ${this.spec.version}`);
    return e;
  }

  hasPath(path) { return this.byPath.has(path); }

  _onFrame(frame) {
    if (!this._inflight) return;
    const { epId } = idsFromArbitration(frame.id);
    if (epId !== this._inflight.epId) return;
    const { resolve, timer } = this._inflight;
    this._inflight = null;
    clearTimeout(timer);
    resolve(frame.data);
  }

  _enqueue(task) {
    const next = this._queue.then(task, task);
    // Swallow rejections in the queue chain so one failure doesn't stall the rest.
    this._queue = next.catch(() => {});
    return next;
  }

  async _request({ epId, payload, expectResponse, timeoutMs = 1000 }) {
    return this._enqueue(async () => {
      const arb = arbitrationFromIds(
        epId, this.spec.hash_low8, this.nodeId,
      );
      // RTR for an empty payload exactly matches the Python channel logic.
      const rtr = !(payload && payload.length);
      let pending;
      if (expectResponse) {
        pending = new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            this._inflight = null;
            reject(new Error(`Timeout on ep ${epId}`));
          }, timeoutMs);
          this._inflight = { epId, resolve, timer };
        });
      }
      await this.driver.send({ id: arb, ext: true, rtr, data: payload || new Uint8Array(0) });
      if (expectResponse) return await pending;
      return undefined;
    });
  }

  async get(path) {
    const ep = this.ep(path);
    if (!ep.get) throw new Error(`Endpoint '${path}' is not gettable`);
    const data = await this._request({ epId: ep.ep_id, payload: null, expectResponse: true });
    return Codec.unpack(ep.dtype, data);
  }

  async set(path, value) {
    const ep = this.ep(path);
    if (!ep.set) throw new Error(`Endpoint '${path}' is not settable`);
    const payload = Codec.pack(ep.dtype, value);
    return this._request({ epId: ep.ep_id, payload, expectResponse: false });
  }

  async call(path, args = []) {
    const ep = this.ep(path);
    if (!ep.call) throw new Error(`Endpoint '${path}' is not callable`);
    const payload = ep.args && ep.args.length
      ? Codec.packArgs(ep.args, args)
      : new Uint8Array(0);
    const expectResponse = ep.kind === 'func';
    const data = await this._request({
      epId: ep.ep_id, payload, expectResponse,
    });
    if (expectResponse) return Codec.unpack(ep.dtype, data);
    return undefined;
  }
}
