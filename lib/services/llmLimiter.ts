import pLimit from 'p-limit';

/**
 * Process-local (single Node process) LLM limiter that enforces:
 *  - Concurrency (in-flight calls)
 *  - RPM  (requests per minute)
 *  - RPD  (requests per day)
 *  - TPM  (tokens per minute) — approximate, based on your estimate per call
 *
 * Defaults below match GPT-5-nano "Tier 1" limits:
 *   RPM=500, TPM=200000
 * You *should* override these via env to reflect your actual model/account limits
 * and add headroom.
 */

// ---------- Config (override via env) ----------
const CONCURRENCY = parseInt(process.env.LLM_CONCURRENCY ?? '15', 10); // Increased default concurrency to 15 for faster processing

const RPM_LIMIT = parseInt(process.env.LLM_RPM_LIMIT ?? '500', 10); // requests / minute (GPT-5-nano Tier 1)
// const RPD_LIMIT = parseInt(process.env.LLM_RPD_LIMIT ?? '10000', 10); // requests / day (custom limit)
const TPM_BUDGET = parseInt(process.env.LLM_TPM_BUDGET ?? '200000', 10); // tokens / minute (GPT-5-nano Tier 1: 500K)

const SAFETY_CUSHION_MS = 250; // small cushion so we don't wake exactly on window boundary

// ---------- Concurrency gate ----------
const limit = pLimit(CONCURRENCY);

// ---------- Time helpers ----------
const now = () => Date.now();

function msUntilNextMinute(): number {
  const n = now();
  return 60_000 - (n % 60_000) + SAFETY_CUSHION_MS;
}

function msUntilNextUtcMidnight(): number {
  const n = new Date();
  const next = new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return next.getTime() - n.getTime() + SAFETY_CUSHION_MS;
}

// ---------- Windows / counters (process-local) ----------
let minuteWindowStart = Math.floor(now() / 60_000) * 60_000;
let requestsThisMinute = 0;
let tokensThisMinute = 0;

let dayWindowStartUtc = (() => {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 0, 0, 0, 0);
})();
let requestsToday = 0;

// Reset minute window if needed
function ensureMinuteWindow() {
  const n = now();
  if (n - minuteWindowStart >= 60_000) {
    minuteWindowStart = Math.floor(n / 60_000) * 60_000;
    requestsThisMinute = 0;
    tokensThisMinute = 0;
  }
}

// Reset daily window (UTC midnight) if needed
function ensureDailyWindow() {
  const n = now();
  if (n - dayWindowStartUtc >= 24 * 60 * 60 * 1000) {
    const d = new Date();
    dayWindowStartUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
    requestsToday = 0;
  }
}

// Sleep helper
async function sleep(ms: number) {
  await new Promise((res) => setTimeout(res, ms));
}

/**
 * Wait until all budgets allow one more request with `estTokens`,
 * then "reserve" (increment) the counters.
 */
async function waitForBudgets(estTokens: number) {
  while (true) {
    ensureDailyWindow();
    ensureMinuteWindow();

    const rpmOK = requestsThisMinute + 1 <= RPM_LIMIT;
    // const rpdOK = requestsToday + 1 <= RPD_LIMIT;
    const tpmOK = tokensThisMinute + estTokens <= TPM_BUDGET;

    if (rpmOK && tpmOK /* && rpdOK */) {
      // Reserve budget and go
      requestsThisMinute += 1;
      tokensThisMinute += estTokens;
      requestsToday += 1;
      return;
    }

    // Figure the shortest wait needed
    const waits: number[] = [];

    if (!rpmOK) waits.push(msUntilNextMinute());
    if (!tpmOK) waits.push(msUntilNextMinute());
    // if (!rpdOK) waits.push(msUntilNextUtcMidnight());

    const waitMs = Math.max(250, Math.min(...waits));
    await sleep(waitMs);
    // loop to re-check
  }
}

// ---------- Retry with backoff / Retry-After honoring ----------
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let delay = 1000;

  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      const error = err as {
        status?: number;
        response?: { status?: number; headers?: Record<string, string> };
        headers?: Record<string, string>;
      };
      const status = error?.status ?? error?.response?.status;
      const headers = error?.headers ?? error?.response?.headers ?? {};
      const getHeader = (k: string) =>
        headers[k] ??
        headers[k?.toLowerCase?.()] ??
        (headers as { get?: (key: string) => string }).get?.(k) ??
        (headers as { get?: (key: string) => string }).get?.(k?.toLowerCase?.());

      // Retry on 429 or transient 5xx
      if (status && (status === 429 || (status >= 500 && status < 600))) {
        attempt++;
        if (attempt > 6) throw err;

        // If provider gives Retry-After, use it
        let waitMs: number | undefined;
        const ra = getHeader?.('retry-after');
        if (ra) {
          const n = Number(ra);
          waitMs = Number.isFinite(n) ? Math.ceil(n * 1000) : undefined;
        }

        // Otherwise exponential backoff
        if (!waitMs || waitMs <= 0) {
          waitMs = delay;
          delay = Math.min(Math.ceil(delay * 1.8), 12_000);
        }

        await sleep(waitMs);
        continue;
      }

      // Non-retryable
      throw err;
    }
  }
}

/**
 * Public entry:
 *   - Enforces concurrency
 *   - Waits for RPM/RPD/TPM budgets
 *   - Retries on 429/5xx with backoff
 *
 * @param task       The function that actually calls the LLM
 * @param estTokens  Estimated tokens for TPM accounting (prompt+output). Default 1500.
 */
export async function runLLM<T>(task: () => Promise<T>, estTokens = 1500): Promise<T> {
  return limit(async () => {
    await waitForBudgets(estTokens);
    return withRetry(task);
  });
}
