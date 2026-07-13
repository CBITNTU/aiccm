import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, locales, type Locale } from "./locales";
import { resolveLocale } from "./resolveLocale";

export { defaultLocale, locales, type Locale };

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  // A cookie only wins if the deployment actually allows that locale; otherwise
  // fall back to the deployment's default locale.
  const locale: Locale = resolveLocale(cookieStore.get("NEXT_LOCALE")?.value);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
