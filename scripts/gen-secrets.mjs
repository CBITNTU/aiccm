/**
 * Generate fresh random secrets, printed in copy-pasteable env format.
 *
 *   node scripts/gen-secrets.mjs
 *
 * Each value is 32 cryptographically-random bytes, base64url-encoded (no padding,
 * URL/env safe). Use these for a new deployment's env vars — never reuse secrets
 * across regions. Nothing is written anywhere; paste them into the target Vercel
 * project's env (Production) or your local .env.
 */
import { randomBytes } from "node:crypto";

const KEYS = ["BETTER_AUTH_SECRET", "CRON_SECRET", "TENDER_SYNC_SECRET"];

const gen = () => randomBytes(32).toString("base64url");

for (const key of KEYS) {
  console.log(`${key}=${gen()}`);
}
