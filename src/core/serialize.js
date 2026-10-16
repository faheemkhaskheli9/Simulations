// Helpers for turning simulation state into compact, JSON-safe data.

const B64 = typeof Buffer !== 'undefined'
  ? { enc: (bytes) => Buffer.from(bytes).toString('base64'), dec: (s) => new Uint8Array(Buffer.from(s, 'base64')) }
  : {
    enc: (bytes) => {
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    dec: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  };

/** Encode a typed array (Float32Array, Int16Array, Uint8Array…) as base64. */
export function encodeTyped(arr) {
  return B64.enc(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
}

/** Decode base64 into an existing typed array (lengths must match). */
export function decodeInto(target, b64) {
  const bytes = B64.dec(b64);
  if (bytes.byteLength !== target.byteLength) throw new Error('Saved grid has a different size');
  new Uint8Array(target.buffer, target.byteOffset, target.byteLength).set(bytes);
  return target;
}

/** Copy only the listed keys of an object (for plain entity snapshots). */
export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

export const SAVE_FORMAT = 'simulations-world';
export const SAVE_VERSION = 1;
