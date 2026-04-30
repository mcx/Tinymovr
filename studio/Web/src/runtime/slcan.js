// SlcanDriver — talks the LAWICEL/slcan ASCII protocol over WebSerial.
//
// Outbound:
//   S<n>\r        set bitrate
//   O\r           open channel
//   C\r           close channel
//   T<id8><len><hex>\r   29-bit data frame
//   R<id8><len>\r        29-bit RTR frame
//   t<id3><len><hex>\r   11-bit data frame
//   r<id3><len>\r        11-bit RTR frame
// Inbound is identical except an additional terminating ACK byte ('\r')
// after command replies and BEL (0x07) on error.
//
// Frame object: { id: number, ext: bool, rtr: bool, data: Uint8Array }
import { sleep } from '../components/base.js';

export class SlcanDriver extends EventTarget {
  constructor(port, { debug = false } = {}) {
    super();
    this._port = port;
    this._reader = null;
    this._writer = null;
    this._open = false;
    this._buf = '';
    this._debug = debug;
    this.bytesRx = 0;
    this.framesRx = 0;
  }

  async open(bitrateCmd = 'S8') {
    // USB-CDC adapters typically ignore the baud rate, but some FTDI-based
    // ones honor it. 1 Mbps is the canonical slcan default. Be explicit
    // about all framing fields so picky adapters don't fall back to defaults
    // we don't expect.
    await this._port.open({
      baudRate: 1000000,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    });
    this._writer = this._port.writable.getWriter();
    this._reader = this._port.readable.getReader();

    // Start the read loop FIRST so responses to the open commands (acks /
    // BEL on errors / unsolicited heartbeats) are visible. Otherwise they
    // sit in the OS buffer with no logging context, which makes debugging
    // adapter-specific quirks miserable.
    this._open = true;
    this._readLoop().catch(err => {
      this.dispatchEvent(new CustomEvent('error', { detail: err }));
    });

    // Some adapters reject S/O when already open; close defensively first.
    // Brief delay between commands accommodates slower firmware.
    await this._sendCmd('C');
    await sleep(20);
    await this._sendCmd(bitrateCmd);
    await sleep(20);
    await this._sendCmd('O');

    if (this._debug) console.info(`[slcan] opened, bitrate cmd '${bitrateCmd}'`);
    this.dispatchEvent(new CustomEvent('opened'));
  }

  async close() {
    this._open = false;
    try { await this._sendCmd('C'); } catch (_) {}
    try { this._reader && await this._reader.cancel(); } catch (_) {}
    try { this._reader && this._reader.releaseLock(); } catch (_) {}
    try { this._writer && this._writer.releaseLock(); } catch (_) {}
    this._reader = null;
    this._writer = null;
    try { await this._port.close(); } catch (_) {}
    this.dispatchEvent(new CustomEvent('closed'));
  }

  async _sendCmd(cmd) {
    if (!this._writer) throw new Error('SlcanDriver not open');
    if (this._debug) console.debug('[slcan] tx cmd', JSON.stringify(cmd));
    const data = new TextEncoder().encode(cmd + '\r');
    await this._writer.write(data);
  }

  async send(frame) {
    if (!this._writer) throw new Error('SlcanDriver not open');
    const idHex = frame.ext
      ? frame.id.toString(16).padStart(8, '0').toUpperCase()
      : frame.id.toString(16).padStart(3, '0').toUpperCase();
    let line;
    if (frame.rtr) {
      const tag = frame.ext ? 'R' : 'r';
      const lenHex = (frame.data?.length ?? 0).toString(16);
      line = `${tag}${idHex}${lenHex}`;
    } else {
      const tag = frame.ext ? 'T' : 't';
      const data = frame.data || new Uint8Array(0);
      const lenHex = data.length.toString(16);
      const hex = Array.from(data, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      line = `${tag}${idHex}${lenHex}${hex}`;
    }
    if (this._debug) console.debug('[slcan] tx', line);
    const bytes = new TextEncoder().encode(line + '\r');
    await this._writer.write(bytes);
  }

  async _readLoop() {
    const dec = new TextDecoder('latin1');
    while (this._open && this._reader) {
      let chunk;
      try {
        const r = await this._reader.read();
        if (r.done) break;
        chunk = r.value;
      } catch (e) {
        if (this._debug) console.warn('[slcan] reader error', e);
        break;
      }
      this.bytesRx += chunk.length;
      this._buf += dec.decode(chunk);
      this._drain();
    }
    if (this._debug) console.info('[slcan] read loop exited');
  }

  _drain() {
    let idx;
    while ((idx = this._findTerminator(this._buf)) !== -1) {
      const line = this._buf.slice(0, idx);
      const term = this._buf.charCodeAt(idx);
      this._buf = this._buf.slice(idx + 1);
      if (!line.length) {
        if (this._debug && term === 0x07) console.debug('[slcan] rx BEL (error)');
        continue;
      }
      if (line.charCodeAt(0) === 0x07) {
        if (this._debug) console.debug('[slcan] rx BEL (error)');
        continue;
      }
      const frame = this._parseLine(line);
      if (frame) {
        this.framesRx++;
        if (this._debug) {
          const idStr = frame.id.toString(16).padStart(frame.ext ? 8 : 3, '0');
          console.debug(
            `[slcan] rx ${frame.ext ? 'ext' : 'std'}${frame.rtr ? ' rtr' : ''} 0x${idStr}`
            + (frame.data.length ? ' [' + Array.from(frame.data, b => b.toString(16).padStart(2,'0')).join(' ') + ']' : ''),
          );
        }
        this.dispatchEvent(new CustomEvent('frame', { detail: frame }));
      } else if (this._debug) {
        console.debug('[slcan] rx unparsed', JSON.stringify(line));
      }
    }
  }

  _findTerminator(s) {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 0x0d || c === 0x07) return i;
    }
    return -1;
  }

  _parseLine(line) {
    const tag = line[0];
    const ext = (tag === 'T' || tag === 'R');
    const rtr = (tag === 'R' || tag === 'r');
    if (!'TtRr'.includes(tag)) return null;
    const idLen = ext ? 8 : 3;
    if (line.length < 1 + idLen + 1) return null;
    const id = parseInt(line.slice(1, 1 + idLen), 16);
    const len = parseInt(line.slice(1 + idLen, 1 + idLen + 1), 16);
    if (Number.isNaN(id) || Number.isNaN(len)) return null;
    let data = new Uint8Array(0);
    if (!rtr) {
      const hex = line.slice(1 + idLen + 1, 1 + idLen + 1 + 2 * len);
      data = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        data[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) & 0xff;
      }
    }
    return { id, ext, rtr, data };
  }
}
