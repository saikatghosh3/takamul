import { webcrypto } from 'crypto';

const ALGO = { name: 'AES-GCM' };

function b64ToBytes(str) {
  return Uint8Array.from(Buffer.from(str, 'base64'));
}

function bytesToB64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function bytesToIv(ivBytes) {
  return bytesToB64(ivBytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function ivToBytes(iv) {
  return b64ToBytes(iv.replace(/-/g, '+').replace(/_/g, '/'));
}

export async function makeKey(keyBase64) {
  return webcrypto.subtle.importKey('raw', b64ToBytes(keyBase64), ALGO, false, ['encrypt', 'decrypt']);
}

export async function encryptJson(keyBase64, data, ivBytes) {
  const key = await makeKey(keyBase64);
  const iv = ivBytes || webcrypto.getRandomValues(new Uint8Array(12));
  const cipher = await webcrypto.subtle.encrypt({ ...ALGO, iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { p: bytesToB64(cipher), iv: bytesToIv(iv) };
}

export async function decryptPayload(keyBase64, payload) {
  const key = await makeKey(keyBase64);
  const buf = await webcrypto.subtle.decrypt({ ...ALGO, iv: ivToBytes(payload.iv) }, key, b64ToBytes(payload.p));
  const text = new TextDecoder().decode(buf);
  try { return JSON.parse(text); } catch { return text; }
}
