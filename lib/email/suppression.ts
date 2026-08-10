import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped email suppression.
 *
 * When a superadmin prepares an account before approving it — editing the
 * company, running AI analysis, deep-matching tenders — none of that work is
 * the user's own action, so none of it may reach the user's inbox. Rather than
 * auditing all ~17 `sendEmail` call sites (and every one added later), the
 * suppression is enforced at the single choke point inside `sendEmail`.
 *
 * Backed by AsyncLocalStorage so it survives `await` boundaries and the
 * fire-and-forget background work some routes kick off (e.g. the AI prefill in
 * `POST /api/admin/approve-user`) without threading a flag through every
 * function signature.
 */

export interface SuppressedEmail {
  to: string;
  subject: string;
  at: string;
}

export interface EmailSuppressionContext {
  /** Why emails are being withheld — surfaced in logs and the audit event. */
  reason: string;
  /** The superadmin performing the action. */
  actorUserId?: string;
  /** The user whose account is being prepared / impersonated. */
  targetUserId?: string;
  /** Everything that would have been sent, in order. */
  suppressed: SuppressedEmail[];
}

/**
 * Pinned to a global so every copy of this module shares one store.
 *
 * Bundlers and test runners can instantiate a module more than once across a
 * graph; two `AsyncLocalStorage` objects would mean `sendEmail` reading a
 * different store than the one the caller entered, and suppression silently
 * failing open. For a mechanism whose whole job is to prevent stray email to a
 * user, failing open is not acceptable.
 */
const STORAGE_KEY = Symbol.for("tndrx.emailSuppressionStorage");

type GlobalWithStorage = typeof globalThis & {
  [STORAGE_KEY]?: AsyncLocalStorage<EmailSuppressionContext>;
};

const globalRef = globalThis as GlobalWithStorage;
const storage: AsyncLocalStorage<EmailSuppressionContext> =
  globalRef[STORAGE_KEY] ??
  (globalRef[STORAGE_KEY] = new AsyncLocalStorage<EmailSuppressionContext>());

/** Create a fresh suppression context. */
export function createEmailSuppressionContext(
  init: Omit<EmailSuppressionContext, "suppressed">,
): EmailSuppressionContext {
  return { ...init, suppressed: [] };
}

/**
 * Run `fn` with email sending disabled. Prefer this when you control the
 * callsite and want the collected `suppressed` list afterwards.
 */
export function withEmailSuppression<T>(
  init: Omit<EmailSuppressionContext, "suppressed">,
  fn: (context: EmailSuppressionContext) => Promise<T>,
): Promise<T> {
  const context = createEmailSuppressionContext(init);
  return storage.run(context, () => fn(context));
}

/**
 * Disable email sending for the remainder of the current async context.
 *
 * IMPORTANT — call this from the route handler's own body, never from inside an
 * awaited helper. `AsyncLocalStorage.enterWith` only affects the current
 * execution context and its descendants: a helper that awaits anything before
 * calling it lands in a child context, and the caller resumes without ever
 * seeing the store. Suppression would then silently fail open.
 *
 *   // WRONG — the handler never sees this
 *   async function guard() { await check(); enableEmailSuppression(...); }
 *   await guard(); await sendEmail(...);          // sends!
 *
 *   // RIGHT — same frame as the work that follows
 *   const { adminOverride } = await guard();
 *   if (adminOverride) enableEmailSuppression(...);
 *   await sendEmail(...);                          // suppressed
 *
 * Prefer `withEmailSuppression` wherever a callback boundary exists — it wraps
 * the continuation and is correct regardless of where it is called.
 */
export function enableEmailSuppression(
  init: Omit<EmailSuppressionContext, "suppressed">,
): EmailSuppressionContext {
  const context = createEmailSuppressionContext(init);
  storage.enterWith(context);
  return context;
}

/** The active suppression context, or undefined when emails may be sent. */
export function getEmailSuppression(): EmailSuppressionContext | undefined {
  return storage.getStore();
}

/** True when the current async context must not send email. */
export function isEmailSuppressed(): boolean {
  return storage.getStore() !== undefined;
}

/** Record an email that was withheld. Called by `sendEmail`. */
export function recordSuppressedEmail(entry: Omit<SuppressedEmail, "at">): void {
  const context = storage.getStore();
  if (!context) return;
  context.suppressed.push({ ...entry, at: new Date().toISOString() });
}

/**
 * Run `fn` with email sending explicitly re-enabled, even inside a suppression
 * scope. The approval email in `POST /api/admin/approve-user` is the one
 * message that must still go out at the end of a prepared-by-admin flow.
 */
export function withEmailSuppressionDisabled<T>(fn: () => Promise<T>): Promise<T> {
  return storage.exit(fn);
}
