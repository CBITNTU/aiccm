import type { DeploymentProfile } from "../types";

/**
 * Thailand deployment (stub). No concrete tender source or company registry yet —
 * tenders/companies are entered and verified manually. Google geocoding is available.
 */
export const thProfile: DeploymentProfile = {
  id: "th",
  brand: {
    name: "TNDRX Thailand",
    supportEmail: "support@tndrx.co.th",
    logoPath: "/brand/tndrx/wordmark.png",
    markPath: "/brand/tndrx/mark.png",
    faviconPath: "/favicon.ico",
    iconPath: "/brand/tndrx/icon-512.png",
    appleIconPath: "/brand/tndrx/apple-icon.png",
    poweredBy: "TNDRX",
  },
  theme: {
    // Distinct teal primary; overrides the blue defaults in globals.css.
    light: {
      primary: "173 80% 36%",
      ring: "173 80% 36%",
      accent: "173 70% 45%",
      "sidebar-primary": "173 70% 45%",
    },
    dark: {
      primary: "173 70% 50%",
      ring: "173 70% 50%",
      accent: "173 60% 55%",
      "sidebar-primary": "173 70% 50%",
    },
  },
  i18n: {
    defaultLocale: "th",
    allowedLocales: ["th", "en"],
  },
  currency: { code: "THB", symbol: "฿", locale: "th-TH" },
  verification: {
    fieldLabel: "Tax ID / Registration Number",
    fieldHint: "optional",
    phonePlaceholder: "+66 ...",
    consentSources: [],
    supportsLookup: false,
  },
  locationTerms: ["thailand", "ไทย", "bangkok", "กรุงเทพ", "chiang mai", "phuket"],
  tenderSources: ["th_manual"],
  verificationProvider: "th_manual",
  geocodingProvider: "google",
  taxonomy: "stub",
  taxonomyLanguage: "en",
  webAnalytics: false,
  ai: { defaultModel: "gpt-5-nano" },
};
