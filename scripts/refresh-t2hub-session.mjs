/**
 * One-shot t2hub session refresh.
 *
 * Logs into t2hub.app with the credentials stored in .env.t2hub, captures the
 * fresh session cookies + window.__sk encryption key, and persists them so the
 * API keeps working without manual re-login / key re-copy.
 *
 * Usage:
 *   node scripts/refresh-t2hub-session.mjs             # headless auto-login
 *   node scripts/refresh-t2hub-session.mjs --interactive  # visible browser (for MFA/OTP)
 */
import { login, validateSession, getSessionStatus } from '../src/lib/t2hub-session.js';

const interactive = process.argv.includes('--interactive') || process.argv.includes('-i');

console.log('Status before:', JSON.stringify(getSessionStatus(), null, 2));

const result = interactive ? await login({ interactive: true }) : await login();
console.log('Login result:', JSON.stringify(result, null, 2));

const v = await validateSession({ force: true });
console.log('Validation after:', JSON.stringify(v, null, 2));
console.log('Status after:', JSON.stringify(getSessionStatus(), null, 2));

process.exit(result.ok && v.ok ? 0 : 1);
