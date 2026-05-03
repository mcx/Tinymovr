// HeartbeatDiscovery — listens for 11- or 29-bit heartbeats at 0x700+id
// and matches the embedded SPECS by hash (incl. legacy hash aliases).
import {
  HEARTBEAT_BASE, HEARTBEAT_MASK, HEARTBEAT_TIMEOUT_MS,
} from './can-id.js';

export class HeartbeatDiscovery extends EventTarget {
  constructor({ router, specs, hashAliases = {} }) {
    super();
    this.router = router;
    this.specs = specs;
    this.byHash = new Map(specs.map(s => [s.hash_uint32, s]));
    // Build alias map: alias_hash -> canonical spec
    this.aliasMap = new Map();
    for (const [canonical, list] of Object.entries(hashAliases || {})) {
      const spec = this.byHash.get(+canonical);
      if (!spec) continue;
      for (const a of list) this.aliasMap.set(+a, spec);
    }
    this.devices = new Map();   // node_id -> {nodeId, spec, hash, lastSeen}
    // Accept both extended and standard heartbeat frames. The firmware
    // emits them as extended (see firmware/src/can/can.c:210) but we
    // tolerate either for cross-version compatibility.
    this._unsub = router.add(
      f => (f.id & HEARTBEAT_MASK) === HEARTBEAT_BASE && !f.rtr && f.data.length >= 4,
      f => this._onHeartbeat(f),
    );
    this._janitor = setInterval(() => this._evict(), 1000);
  }

  destroy() {
    try { this._unsub(); } catch (_) {}
    clearInterval(this._janitor);
  }

  /* Refresh a device's last-seen time without going through a full heartbeat
     parse. Called by AvlosClient on every response, so that continuous
     polling keeps the focused device alive in the roster even though the
     firmware suppresses heartbeats while it is busy answering requests
     (`last_msg_ms` is reset on every response in firmware/src/can/can.c). */
  markAlive(nodeId) {
    const dev = this.devices.get(nodeId);
    if (dev) dev.lastSeen = performance.now();
  }

  _onHeartbeat(frame) {
    const nodeId = frame.id & 0x3f;
    const dv = new DataView(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
    const hash = dv.getUint32(0, true);
    const spec = this.byHash.get(hash) || this.aliasMap.get(hash) || null;
    const existed = this.devices.get(nodeId);
    const next = { nodeId, hash, spec, lastSeen: performance.now() };
    this.devices.set(nodeId, next);
    const newDevice = !existed;
    const hashChanged = existed && existed.hash !== hash;
    const stateChanged = newDevice || hashChanged
      || (existed && (existed.spec === null) !== (spec === null));
    if (stateChanged) {
      if (newDevice && !spec) {
        console.warn(
          `[discovery] node ${nodeId} heartbeating with unknown hash 0x${hash.toString(16).padStart(8, '0')}.`,
          'No matching spec embedded; this firmware is newer or older than the dashboard knows about.',
          'Run `npm run build` after adding/updating the spec YAML.',
        );
      } else if (newDevice) {
        console.info(
          `[discovery] node ${nodeId} matched spec ${spec.version} (hash 0x${hash.toString(16).padStart(8, '0')})`,
        );
      }
      this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }));
    }
  }

  _evict() {
    const now = performance.now();
    let changed = false;
    for (const [k, v] of this.devices) {
      if (now - v.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        this.devices.delete(k);
        changed = true;
      }
    }
    if (changed) this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }));
  }

  snapshot() {
    return [...this.devices.values()].sort((a, b) => a.nodeId - b.nodeId);
  }
}
