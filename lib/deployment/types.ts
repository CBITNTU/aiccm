import type { Locale } from "@/i18n/locales";

/**
 * Identifier for a deployment region. The active one is selected at deploy time
 * via the `DEPLOYMENT_PROFILE` env var (see `lib/deployment/index.ts`).
 */
export type DeploymentProfileId = "uk" | "cn" | "th";

/**
 * Branding fields. This whole object is safe to expose to the browser.
 */
export interface BrandConfig {
  /** Display name — replaces hardcoded "TNDRX" and the email PLATFORM_NAME default. */
  name: string;
  /** Support contact email — replaces hardcoded support@tndrx.com. */
  supportEmail: string;
  /** Optional public-facing base URL for the deployment. */
  supportUrl?: string;
  /** Path (under /public) to the nav/hero logo image. */
  logoPath: string;
  /** Path (under /public) to the favicon. */
  faviconPath: string;
  /** Optional "Powered by …" footer label. */
  poweredBy?: string;
}

/**
 * HSL token strings ("221 83% 53%") keyed by CSS custom property name without the
 * leading `--` (e.g. "primary", "accent", "background"). They override the defaults
 * declared in `app/globals.css`. Client-safe.
 */
export interface ThemeConfig {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** Locale binding for the deployment. Client-safe. */
export interface I18nConfig {
  defaultLocale: Locale;
  /** The locales the locale-switcher should offer for this deployment. */
  allowedLocales: Locale[];
}

/** Currency formatting for the deployment. Client-safe. */
export interface CurrencyConfig {
  /** ISO 4217 code, e.g. "GBP", "CNY", "THB". */
  code: string;
  /** Symbol used in compact contexts, e.g. "£", "¥", "฿". */
  symbol: string;
  /** BCP-47 locale used for Intl.NumberFormat, e.g. "en-GB". */
  locale: string;
}

/**
 * Display configuration for the company registration / verification field, used by
 * the onboarding UI. The verification *behavior* lives in a server-side registry
 * adapter (`lib/companies/registry`); this is only the client-facing presentation.
 */
export interface VerificationDisplayConfig {
  /** Label for the registration-number field, e.g. "Companies House Number". */
  fieldLabel: string;
  /** Short hint shown beside the label, e.g. "optional, 8 digits if UK". */
  fieldHint: string;
  /** Region-appropriate phone placeholder, e.g. "01234 567890". */
  phonePlaceholder: string;
  /** Optional fixed length for the registration number input. */
  numberMaxLength?: number;
  /** Public data sources named in the consent copy. Empty = no auto-fetch. */
  consentSources: string[];
  /** Whether the registry offers automated lookup (drives UI affordances). */
  supportsLookup: boolean;
}

/**
 * The client-safe subset of a deployment profile. This is what crosses the
 * server→client boundary via `getPublicProfile()` / `useDeployment()`.
 */
export interface PublicDeploymentProfile {
  id: DeploymentProfileId;
  brand: BrandConfig;
  theme: ThemeConfig;
  i18n: I18nConfig;
  currency: CurrencyConfig;
  verification: VerificationDisplayConfig;
}

/**
 * The full deployment profile. Server-only fields (adapters, AI defaults) reference
 * server-side registries and must never be shipped to the browser.
 */
export interface DeploymentProfile extends PublicDeploymentProfile {
  /**
   * Terms used by the basic-match location overlap heuristic
   * (`lib/services/basicMatchContext.ts`). Lowercased place/region names.
   */
  locationTerms: string[];
  /** Registered tender-source adapter ids enabled for this deployment. */
  tenderSources: string[];
  /** Registered company-registry adapter id for verification/enrichment. */
  verificationProvider: string;
  /** Geocoding provider id. "none" disables geocoding (e.g. China). */
  geocodingProvider: "google" | "none";
  /** Registered taxonomy provider id. */
  taxonomy: string;
  /**
   * AI fallbacks. Runtime authority remains the DB `platform_settings`; these only
   * seed the default when no DB row exists.
   */
  ai: {
    defaultModel: string;
    matchingModel?: string;
  };
}
