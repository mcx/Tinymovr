// Config import / export — wire-format compatible with the desktop
// `tinymovr` Studio (Python). The contract mirrors avlos's
// `ImpexNode.export_values` / `ImpexNode.import_values`:
//
//   - Walk the device tree and emit a nested object keyed by endpoint
//     path components (e.g. `controller.position.p_gain`
//     -> `{controller: {position: {p_gain: <value>}}}`).
//   - Only leaves whose `meta.export === true` are included.
//   - Unitless numeric attribute  -> bare JSON number.
//   - Unit-bearing numeric attr   -> string `"<num> <unit>"` matching
//     `str(pint.Quantity)` produced by `AvlosEncoder` on the desktop.
//     The compact symbols emitted by `build_specs.py` ("A", "V",
//     "tick / s") are parseable by `ureg(...)` in
//     `RemoteAttribute.set_value_with_string`.
//   - Enum -> integer (Python `IntEnum` JSON-encodes as int and
//     `RemoteEnum.set_value` accepts ints natively).
//
// On import we accept either form (number or unit-tagged string) and
// always set in native units, since `client.set` already takes the raw
// numeric. This keeps round-trips lossless across the two studios.

const NUMERIC_RE = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/;

function setNested(obj, segments, value) {
  let cur = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const k = segments[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[segments[segments.length - 1]] = value;
}

function parseNumeric(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const m = NUMERIC_RE.exec(v);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}

function formatLeaf(value, ep) {
  // Match Python AvlosEncoder output: unit-bearing => string
  // "<num> <unit>"; everything else falls through as a JSON-native type.
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  if (ep.unit) return `${value} ${ep.unit}`;
  return value;
}

// True for endpoints that may participate in import/export. We mirror
// avlos's filter (`meta.export === true`) verbatim so the YAML stays
// the single source of truth for what is and isn't a config knob.
function isExportable(ep) {
  return !!(ep && ep.meta && ep.meta.export === true);
}

export async function exportConfig(client, { onProgress } = {}) {
  const eps = client.spec.endpoints.filter(ep => isExportable(ep) && ep.get);
  const data = {};
  const errors = [];
  let count = 0;
  let i = 0;
  for (const ep of eps) {
    i++;
    try {
      const v = await client.get(ep.path);
      const formatted = formatLeaf(v, ep);
      setNested(data, ep.path.split('.'), formatted);
      count++;
    } catch (err) {
      errors.push({ path: ep.path, error: err && err.message || String(err) });
      console.warn(`[config-io] export failed for ${ep.path}:`, err);
    }
    if (onProgress) onProgress({ index: i, total: eps.length, path: ep.path });
  }
  return { data, count, errors, total: eps.length };
}

function* walkLeaves(obj, prefix = []) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    // Skip metadata keys (anything starting with "_"). Python's import
    // ignores unknown keys anyway, but we explicitly reserve the "_"
    // prefix for tooling annotations like `_meta`.
    if (k.startsWith('_')) continue;
    const next = prefix.concat(k);
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      yield* walkLeaves(v, next);
    } else {
      yield { path: next.join('.'), value: v };
    }
  }
}

// Round-trip tolerance for verifying a value landed correctly.
// Firmware-side float32 + Pint unit conversions on the desktop side
// can introduce ~1e-7 relative error; allow a generous 1e-4 to catch
// silent clamping/rejection without false-positiving on noise.
const VERIFY_REL_TOL = 1e-4;
const VERIFY_ABS_TOL = 1e-6;
function approxEqual(expected, actual, ep) {
  if (expected === actual) return true;
  if (typeof expected !== 'number' || typeof actual !== 'number') return false;
  if (ep && (ep.kind === 'enum' || ep.dtype === 'bool')) {
    return Math.trunc(expected) === Math.trunc(actual);
  }
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) return false;
  const diff = Math.abs(expected - actual);
  const tol = Math.max(VERIFY_ABS_TOL, Math.abs(expected) * VERIFY_REL_TOL);
  return diff <= tol;
}

export async function importConfig(client, data, { onProgress, verify = true } = {}) {
  const leaves = Array.from(walkLeaves(data));
  const result = {
    applied: 0,
    skipped: [],     // paths absent from spec or not settable / not exportable
    errors: [],      // paths that errored on the wire
    mismatches: [],  // paths where set succeeded but read-back didn't match
    total: leaves.length,
  };
  let i = 0;
  for (const { path, value } of leaves) {
    i++;
    const ep = client.byPath.get(path);
    if (!ep || !ep.set || !isExportable(ep)) {
      result.skipped.push(path);
      if (onProgress) onProgress({ index: i, total: leaves.length, path, status: 'skipped' });
      continue;
    }
    let toSend;
    if (ep.kind === 'enum') {
      // Enums round-trip as integers. Match Python's set_value(int).
      // Strings (option names) would also work in Python, but the spec
      // doesn't expose set_value_with_string here so reject anything
      // non-numeric to be safe.
      const n = parseNumeric(value);
      if (!Number.isFinite(n)) {
        result.errors.push({ path, error: `non-numeric enum value: ${JSON.stringify(value)}` });
        continue;
      }
      toSend = Math.trunc(n);
    } else if (ep.dtype === 'bool') {
      toSend = (value === true) || value === 1 || value === '1' || value === 'true';
    } else {
      const n = parseNumeric(value);
      if (!Number.isFinite(n)) {
        result.errors.push({ path, error: `non-numeric value: ${JSON.stringify(value)}` });
        continue;
      }
      toSend = n;
    }
    try {
      await client.set(path, toSend);
      result.applied++;
      // Read back immediately so silent firmware-side clamping or
      // out-of-range rejection surfaces in the report. Skipped only
      // if explicitly disabled or the endpoint isn't gettable.
      if (verify && ep.get) {
        try {
          const actual = await client.get(path);
          if (!approxEqual(toSend, actual, ep)) {
            result.mismatches.push({ path, expected: toSend, actual });
          }
        } catch (err) {
          // Verification failure is non-fatal — the set already succeeded.
          // Record as a mismatch so the user sees something is off.
          result.mismatches.push({
            path, expected: toSend, actual: null,
            error: err && err.message || String(err),
          });
        }
      }
      if (onProgress) onProgress({ index: i, total: leaves.length, path, status: 'applied' });
    } catch (err) {
      result.errors.push({ path, error: err && err.message || String(err) });
      console.warn(`[config-io] import failed for ${path}:`, err);
      if (onProgress) onProgress({ index: i, total: leaves.length, path, status: 'error' });
    }
  }
  return result;
}

// Build the small `_meta` block we tuck into exports for traceability.
// Python's `import_values` walks the device tree (not the JSON keys),
// so any `_`-prefixed top-level key is silently ignored on the desktop.
export function buildExportMeta(client) {
  return {
    tool: 'Motionlayer Studio · Web',
    spec_version: client.spec.version,
    spec_hash: '0x' + client.spec.hash_uint32.toString(16).padStart(8, '0'),
    node_id: client.nodeId,
    exported_at: new Date().toISOString(),
  };
}
