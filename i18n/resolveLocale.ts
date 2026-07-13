import { getActiveProfile } from "@/lib/deployment";
import { type Locale } from "./locales";

/**
 * Resolve the effective locale from a `NEXT_LOCALE` cookie value, clamped to the
 * active deployment's allowed locales, falling back to its default locale.
 *
 * Shared by the next-intl request config (`i18n/request.ts`) and the email layer
 * (`lib/email/i18n.ts`) so both derive locale the same way.
 */
export function resolveLocale(cookieValue: string | undefined): Locale {
  const { i18n } = getActiveProfile();
  return cookieValue && i18n.allowedLocales.includes(cookieValue as Locale)
    ? (cookieValue as Locale)
    : i18n.defaultLocale;
}
