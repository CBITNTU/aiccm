import type { DeploymentProfile } from "../types";

/**
 * China deployment (stub). No UK/EU tender sources or Companies House — tenders and
 * companies are entered/verified manually until a concrete CN source/registry is wired.
 * Google Maps is blocked in China, so geocoding is disabled. AI defaults to DeepSeek
 * (OpenAI is not reachable); `resolveModel()` routes `deepseek-*` automatically.
 */
export const cnProfile: DeploymentProfile = {
  id: "cn",
  brand: {
    name: "TNDRX 中国",
    supportEmail: "support@tndrx.cn",
    logoPath: "/brand/cn/logo.png",
    faviconPath: "/brand/cn/favicon.ico",
    poweredBy: "TNDRX",
  },
  theme: {
    // Distinct red-leaning primary; overrides the blue defaults in globals.css.
    light: {
      primary: "0 72% 45%",
      ring: "0 72% 45%",
      accent: "0 72% 55%",
      "sidebar-primary": "0 72% 55%",
    },
    dark: {
      primary: "0 72% 60%",
      ring: "0 72% 60%",
      accent: "0 72% 65%",
      "sidebar-primary": "0 72% 60%",
    },
  },
  i18n: {
    defaultLocale: "zh-CN",
    allowedLocales: ["zh-CN", "en"],
  },
  currency: { code: "CNY", symbol: "¥", locale: "zh-CN" },
  verification: {
    fieldLabel: "统一社会信用代码 (Unified Social Credit Code)",
    fieldHint: "optional",
    phonePlaceholder: "138 0000 0000",
    consentSources: [],
    supportsLookup: false,
  },
  locationTerms: ["china", "中国", "beijing", "北京", "shanghai", "上海"],
  tenderSources: ["cn_manual"],
  verificationProvider: "cn_manual",
  geocodingProvider: "none",
  taxonomy: "stub",
  ai: { defaultModel: "deepseek-chat", matchingModel: "deepseek-chat" },
};
