import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { createTranslator } from "next-intl";
import { type Locale } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/resolveLocale";
import enMessages from "@/messages/en.json";
import zhCNMessages from "@/messages/zh-CN.json";
import thMessages from "@/messages/th.json";

// A shape with an index signature so next-intl can resolve `Emails.*` keys.
// (Loose `Record<string, unknown>` collapses next-intl's key inference to
// `never`; the JSON also holds arrays, which its stricter message type omits —
// hence the cast.)
type EmailMessages = { [id: string]: EmailMessages | string };

const MESSAGES: Record<Locale, EmailMessages> = {
  "en": enMessages as unknown as EmailMessages,
  "zh-CN": zhCNMessages as unknown as EmailMessages,
  "th": thMessages as unknown as EmailMessages,
};

// BCP-47 locale used for date/number formatting inside emails.
const DATE_LOCALES: Record<Locale, string> = {
  "en": "en-GB",
  "zh-CN": "zh-CN",
  "th": "th-TH",
};

/**
 * Resolve the recipient's email locale from the `NEXT_LOCALE` cookie, clamped to
 * the active deployment's allowed locales (falling back to its default). Mirrors
 * how the UI resolves locale (see `i18n/request.ts`).
 *
 * Must be called inside an HTTP request context (it reads cookies).
 *
 * NOTE: for emails triggered by one actor but delivered to a different recipient
 * (e.g. an admin approving a user, an inviter inviting a teammate), the cookie
 * reflects the actor rather than the recipient. With no per-user stored language
 * this is the best available signal, and on a single-language deployment it still
 * resolves to that deployment's locale.
 */
export async function getEmailLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get("NEXT_LOCALE")?.value);
}

type EmailTagFn = (chunks: ReactNode) => string;
type EmailValues = Record<string, string | number | undefined | EmailTagFn>;

/**
 * Permissive translator interface for emails. next-intl's strictly-typed
 * signature can't infer ICU args from our dynamically-typed message map (it
 * collapses `values` to `undefined`), and email keys are validated at runtime
 * against the JSON, so we expose a simple string-keyed API. `rich` returns a
 * plain string here because our tag renderers (e.g. {@link strongTag}) do.
 */
export interface EmailTranslator {
  (key: string, values?: EmailValues): string;
  rich(key: string, values?: EmailValues): string;
  raw(key: string): unknown;
}

/**
 * Synchronous translator scoped to the `Emails` namespace for a given locale.
 * Request-independent (takes messages directly), so it renders any locale
 * regardless of the ambient request — the right primitive for emails.
 */
export function getEmailTranslator(locale: Locale): EmailTranslator {
  return createTranslator({
    locale,
    messages: MESSAGES[locale],
    namespace: "Emails",
  }) as unknown as EmailTranslator;
}

/** BCP-47 locale string for date formatting in emails. */
export function emailDateLocale(locale: Locale): string {
  return DATE_LOCALES[locale];
}

/**
 * Rich-text tag renderer that wraps a chunk in `<strong>`, for `t.rich(...)`
 * calls inside email HTML. Use as: `t.rich("key", { b: strongTag, ...values })`.
 */
export const strongTag = (chunks: ReactNode) => `<strong>${chunks}</strong>`;
