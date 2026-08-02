import { describe, expect, it } from "vitest";
import {
  CURRENCY_CONFIGS,
  formatBudgetRange,
  formatCurrency,
  formatCurrencyCompact,
  resolveCurrencyConfig,
} from "@/lib/format/currency";

const GBP = CURRENCY_CONFIGS.GBP;
const CNY = CURRENCY_CONFIGS.CNY;

describe("resolveCurrencyConfig", () => {
  it("resolves known ISO codes case-insensitively", () => {
    expect(resolveCurrencyConfig("EUR", GBP)).toEqual(CURRENCY_CONFIGS.EUR);
    expect(resolveCurrencyConfig("cny", GBP)).toEqual(CNY);
  });

  it("falls back for null, undefined, empty, or unknown codes", () => {
    expect(resolveCurrencyConfig(null, GBP)).toBe(GBP);
    expect(resolveCurrencyConfig(undefined, GBP)).toBe(GBP);
    expect(resolveCurrencyConfig("", GBP)).toBe(GBP);
    expect(resolveCurrencyConfig("XYZ", GBP)).toBe(GBP);
  });
});

describe("formatCurrency", () => {
  it("formats major units with no decimals", () => {
    expect(formatCurrency(1500000, GBP)).toBe("£1,500,000");
    expect(formatCurrency(0, GBP)).toBe("£0");
  });

  it("uses the config's locale and symbol", () => {
    expect(formatCurrency(1000, CNY)).toBe("¥1,000");
  });

  it("formats negative amounts", () => {
    expect(formatCurrency(-500, GBP)).toBe("-£500");
  });
});

describe("formatCurrencyCompact", () => {
  it("renders thousands with a k suffix", () => {
    expect(formatCurrencyCompact(120000, GBP)).toBe("£120k");
    expect(formatCurrencyCompact(1500, GBP)).toBe("£2k"); // rounds
    expect(formatCurrencyCompact(0, GBP)).toBe("£0k");
  });

  it("returns an empty string for non-finite amounts", () => {
    expect(formatCurrencyCompact(Number.NaN, GBP)).toBe("");
    expect(formatCurrencyCompact(Number.POSITIVE_INFINITY, GBP)).toBe("");
  });
});

describe("formatBudgetRange", () => {
  it("formats both bounds when present", () => {
    expect(formatBudgetRange(100000, 500000, GBP)).toBe(
      "£100,000 - £500,000",
    );
  });

  it("formats open-ended ranges", () => {
    expect(formatBudgetRange(100000, null, GBP)).toBe("£100,000+");
    expect(formatBudgetRange(null, 500000, GBP)).toBe("Up to £500,000");
  });

  it("returns an empty string when both bounds are absent", () => {
    expect(formatBudgetRange(null, null, GBP)).toBe("");
    expect(formatBudgetRange(undefined, undefined, GBP)).toBe("");
  });

  it("treats 0 as a real bound, not as absent", () => {
    expect(formatBudgetRange(0, 500000, GBP)).toBe("£0 - £500,000");
  });
});
