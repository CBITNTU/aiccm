import type { CurrencyConfig } from "@/lib/deployment/types";

/**
 * Known currency configs keyed by ISO 4217 code, so a bare per-tender `currency`
 * code (stored on `tenders.currency`) can be resolved to a full CurrencyConfig.
 * Kept in sync with the currency declared on each deployment profile
 * (`lib/deployment/profiles/*`).
 */
export const CURRENCY_CONFIGS: Record<string, CurrencyConfig> = {
  GBP: { code: "GBP", symbol: "£", locale: "en-GB" },
  EUR: { code: "EUR", symbol: "€", locale: "en-IE" },
  CNY: { code: "CNY", symbol: "¥", locale: "zh-CN" },
  THB: { code: "THB", symbol: "฿", locale: "th-TH" },
};

/**
 * Resolve a per-tender ISO currency code to a CurrencyConfig, falling back to the
 * active deployment profile's currency for NULL/legacy rows or unknown codes.
 */
export function resolveCurrencyConfig(
  code: string | null | undefined,
  fallback: CurrencyConfig,
): CurrencyConfig {
  if (!code) return fallback;
  return CURRENCY_CONFIGS[code.toUpperCase()] ?? fallback;
}

/**
 * Format an amount as a currency string for the given deployment currency.
 *
 * IMPORTANT: this does NOT rescale the input — pass the same number the previous
 * `£${n.toLocaleString()}` call sites used, so displayed figures are unchanged
 * except for the currency symbol. (Tender budgets are stored in minor units in the
 * DB; the existing UI displayed them without dividing, and that behavior is preserved.)
 */
export function formatCurrency(amount: number, currency: CurrencyConfig): string {
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: "currency",
      currency: currency.code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Fall back to symbol + grouped number if the runtime lacks the locale/currency.
    return `${currency.symbol}${amount.toLocaleString()}`;
  }
}

/** Compact "12k" style amount with the currency symbol, e.g. "£120k". */
export function formatCurrencyCompact(amount: number, currency: CurrencyConfig): string {
  return `${currency.symbol}${(amount / 1000).toFixed(0)}k`;
}

/** Format a budget range, omitting whichever bound is absent. Returns "" if both absent. */
export function formatBudgetRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: CurrencyConfig,
): string {
  if (min != null && max != null) {
    return `${formatCurrency(min, currency)} - ${formatCurrency(max, currency)}`;
  }
  if (min != null) return `${formatCurrency(min, currency)}+`;
  if (max != null) return `Up to ${formatCurrency(max, currency)}`;
  return "";
}
