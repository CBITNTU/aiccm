export const locales = ["en", "zh-CN", "th"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export type LocaleMeta = { nativeName: string; englishName: string };

export const localeMeta: Record<Locale, LocaleMeta> = {
  "en": { nativeName: "English", englishName: "English" },
  "zh-CN": { nativeName: "简体中文", englishName: "Chinese (Simplified)" },
  "th": { nativeName: "ไทย", englishName: "Thai" },
};
