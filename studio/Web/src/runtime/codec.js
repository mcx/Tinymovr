// Little-endian pack/unpack for avlos primitive types. Single in-line
// 8-byte buffer reused per call; output is a fresh Uint8Array view sized
// to the encoded type (so the caller can splice it directly into a CAN
// frame payload).
export const Codec = {
  pack(dtype, value) {
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    let n = 0;
    switch (dtype) {
      case 'bool':   dv.setUint8 (0, value ? 1 : 0);      n = 1; break;
      case 'uint8':  dv.setUint8 (0, value & 0xff);       n = 1; break;
      case 'int8':   dv.setInt8  (0, value | 0);          n = 1; break;
      case 'uint16': dv.setUint16(0, value & 0xffff,true);n = 2; break;
      case 'int16':  dv.setInt16 (0, value | 0,    true); n = 2; break;
      case 'uint32': dv.setUint32(0, value >>> 0,  true); n = 4; break;
      case 'int32':  dv.setInt32 (0, value | 0,    true); n = 4; break;
      case 'float':  dv.setFloat32(0, +value,      true); n = 4; break;
      default: throw new Error(`Unsupported dtype ${dtype}`);
    }
    return new Uint8Array(buf, 0, n);
  },
  unpack(dtype, bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    switch (dtype) {
      case 'bool':   return !!dv.getUint8(0);
      case 'uint8':  return dv.getUint8 (0);
      case 'int8':   return dv.getInt8  (0);
      case 'uint16': return dv.getUint16(0, true);
      case 'int16':  return dv.getInt16 (0, true);
      case 'uint32': return dv.getUint32(0, true);
      case 'int32':  return dv.getInt32 (0, true);
      case 'float':  return dv.getFloat32(0, true);
      case 'string': {
        let end = 0;
        while (end < bytes.length && bytes[end] !== 0) end++;
        return new TextDecoder().decode(bytes.slice(0, end));
      }
      default: throw new Error(`Unsupported dtype ${dtype}`);
    }
  },
  packArgs(args, values) {
    const parts = args.map((a, i) => Codec.pack(a.dtype, values[i]));
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  },
};
