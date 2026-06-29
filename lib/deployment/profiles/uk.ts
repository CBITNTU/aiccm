import type { DeploymentProfile } from "../types";

/**
 * UK / EU — the original deployment and the reference implementation.
 * Theme overrides are intentionally empty: UK relies on the defaults declared in
 * `app/globals.css`. Other regions override specific tokens.
 */
export const ukProfile: DeploymentProfile = {
  id: "uk",
  brand: {
    name: "TNDRX",
    supportEmail: "support@tndrx.com",
    supportUrl: "https://tndrx.com",
    logoPath: "/cbit-logo.png",
    faviconPath: "/favicon.ico",
    poweredBy: "TNDRX",
  },
  theme: {
    light: {},
    dark: {},
  },
  i18n: {
    defaultLocale: "en",
    allowedLocales: ["en", "zh-CN"],
  },
  currency: { code: "GBP", symbol: "£", locale: "en-GB" },
  verification: {
    fieldLabel: "Companies House Number",
    fieldHint: "optional, 8 digits if UK",
    phonePlaceholder: "01234 567890",
    numberMaxLength: 8,
    consentSources: ["Companies House", "Endole"],
    supportsLookup: true,
  },
  locationTerms: [
    "london",
    "manchester",
    "birmingham",
    "leeds",
    "glasgow",
    "edinburgh",
    "scotland",
    "wales",
    "northern ireland",
    "england",
    "uk",
    "united kingdom",
    "yorkshire",
    "merseyside",
    "cornwall",
    "devon",
    "kent",
    "surrey",
    "essex",
    "lancashire",
  ],
  tenderSources: ["find_tender", "ted"],
  verificationProvider: "uk_companies_house",
  geocodingProvider: "google",
  taxonomy: "cpv_eic",
  ai: { defaultModel: "gpt-5-nano" },
};
