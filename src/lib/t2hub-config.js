import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Live .env.t2hub configuration.
 *
 * Unlike the previous static module-level parse (which cached a stale key/cookies
 * for the whole process lifetime), this module holds a mutable in-memory copy and
 * can be reloaded/persisted at any time. The t2hub session manager
 * (t2hub-session.js) writes fresh cookies + the current window.__sk key here after
 * every automated login, so decryption never goes stale until the server restarts
 * (and even then it re-logs in automatically).
 */

export const ENV_FILE = join(process.cwd(), '.env.t2hub');

export const T2HUB_SITE_URL_DEFAULT = 'https://t2hub.app';
export const T2HUB_LOGIN_URL_DEFAULT = 'https://t2hub.app/takamol/agent/login';
export const T2HUB_APP_URL_DEFAULT = 'https://t2hub.app/takamol';
export const T2HUB_BASE_URL_DEFAULT = 'https://t2hub.app/takamol/api';

function parseEnv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

let env = {};
try {
  env = parseEnv(readFileSync(ENV_FILE, 'utf-8'));
} catch {
  env = {};
}

export function getEnv() {
  return env;
}

export function reloadEnv() {
  try {
    env = parseEnv(readFileSync(ENV_FILE, 'utf-8'));
  } catch {
    env = {};
  }
  return env;
}

// Persist the given keys into .env.t2hub, keeping every other line (including
// comments and unknown keys) untouched. Updates the in-memory copy as well.
export function updateEnv(updates) {
  let raw = '';
  try {
    raw = readFileSync(ENV_FILE, 'utf-8');
  } catch {
    raw = '';
  }

  const lines = raw.split(/\r?\n/);
  const written = new Set();
  const out = [];

  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[1])) {
      out.push(`${m[1]}=${updates[m[1]]}`);
      written.add(m[1]);
    } else {
      out.push(line);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!written.has(key)) out.push(`${key}=${value}`);
  }

  const next = out.join('\n');
  writeFileSync(ENV_FILE, next, 'utf-8');
  env = parseEnv(next);
  return env;
}
