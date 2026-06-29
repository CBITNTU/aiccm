import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { getActiveProfile } from "@/lib/deployment";
import { defaultLocale, locales, type Locale } from "./locales";

export { defaultLocale, locales, type Locale };

export default getRequestConfig(async () => {
  const { i18n } = getActiveProfile();
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;

  // A cookie only wins if the deployment actually allows that locale; otherwise
  // fall back to the deployment's default locale.
  const locale: Locale =
    cookieLocale && i18n.allowedLocales.includes(cookieLocale as Locale)
      ? (cookieLocale as Locale)
      : i18n.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
