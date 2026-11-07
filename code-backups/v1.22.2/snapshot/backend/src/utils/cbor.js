/**
 * Minimal CBOR (RFC 8949) for WebAuthn (v1.22.0).
 *
 * Covers what attestation objects and COSE keys use: unsigned and negative
 * integers, byte and text strings, arrays, maps, true/false/null. Definite
 * lengths only; anything else is refused. Maps decode to Map so integer
 * keys (COSE uses -1, -2, ...) keep their type. encode() exists for tests
 * and is the exact inverse for these types.
 */

'use strict';

const MAX_DEPTH = 16;

function fail(msg) {
  throw new Error(`Invalid CBOR: ${msg}`);
}

function decodeFirst(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let pos = 0;

  const need = (n) => { if (pos + n > buf.length) fail('truncated'); };

  function readLength(info) {
    if (info < 24) return info;
    if (info === 24) { need(1); return buf[pos++]; }
    if (info === 25) { need(2); const v = buf.readUInt16BE(pos); pos += 2; return v; }
    if (info === 26) { need(4); const v = buf.readUInt32BE(pos); pos += 4; return v; }
    if (info === 27) {
      need(8);
      const v = buf.readBigUInt64BE(pos); pos += 8;
      if (v > BigInt(Number.MAX_SAFE_INTEGER)) fail('integer too large');
      return Number(v);
    }
    fail(info === 31 ? 'indefinite length not supported' : 'reserved length');
  }

  function item(depth) {
    if (depth > MAX_DEPTH) fail('nested too deeply');
    need(1);
    const head = buf[pos++];
    const major = head >> 5;
    const info = head & 0x1f;

    switch (major) {
      case 0: return readLength(info);
      case 1: return -1 - readLength(info);
      case 2: { const n = readLength(info); need(n); const v = Buffer.from(buf.subarray(pos, pos + n)); pos += n; return v; }
      case 3: { const n = readLength(info); need(n); const v = buf.toString('utf8', pos, pos + n); pos += n; return v; }
      case 4: { const n = readLength(info); const out = []; for (let i = 0; i < n; i += 1) out.push(item(depth + 1)); return out; }
      case 5: {
        const n = readLength(info);
        const out = new Map();
        for (let i = 0; i < n; i += 1) { const k = item(depth + 1); out.set(k, item(depth + 1)); }
        return out;
      }
      case 7:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        return fail('unsupported simple value or float');
      default:
        return fail('tags are not supported');
    }
  }

  const value = item(0);
  return { value, length: pos };
}

function decode(input) {
  const { value, length } = decodeFirst(input);
  if (length !== (Buffer.isBuffer(input) ? input.length : Buffer.from(input).length)) fail('trailing bytes');
  return value;
}

function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 0x100) return Buffer.from([(major << 5) | 24, n]);
  if (n < 0x10000) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b; }
  if (n < 0x100000000) { const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b; }
  const b = Buffer.alloc(9); b[0] = (major << 5) | 27; b.writeBigUInt64BE(BigInt(n), 1); return b;
}

function encode(value) {
  if (value === false) return Buffer.from([0xf4]);
  if (value === true) return Buffer.from([0xf5]);
  if (value === null) return Buffer.from([0xf6]);
  if (Number.isInteger(value)) return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.concat([head(2, value.length), Buffer.from(value)]);
  if (typeof value === 'string') { const b = Buffer.from(value, 'utf8'); return Buffer.concat([head(3, b.length), b]); }
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(encode)]);
  if (value instanceof Map) {
    const parts = [head(5, value.size)];
    for (const [k, v] of value) parts.push(encode(k), encode(v));
    return Buffer.concat(parts);
  }
  throw new Error(`cbor.encode: unsupported value ${typeof value}`);
}

module.exports = { decode, decodeFirst, encode };
