import { describe, it, expect, vi, afterEach } from "vitest";

// lib/matchingUsage imports @/lib/db (pg Pool) for its DB-backed helpers.
// Stub it so importing the module never touches a real connection.
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  getMonthStart,
  getNextMonthStart,
  getUsageWindowStart,
  getEffectiveMatchingLimit,
} from "@/lib/matchingUsage";
import type { PlatformMatchingSettings } from "@/lib/platformMatchingSettings";

afterEach(() => {
  vi.useRealTimers();
});

describe("getMonthStart", () => {
  it("returns midnight UTC on the 1st of the current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:34:56.789Z"));
    expect(getMonthStart().toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("returns the same instant when already at the month boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    expect(getMonthStart().toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("uses UTC, not local time, at the end of a month", () => {
    vi.useFakeTimers();
    // One millisecond before September in UTC.
    vi.setSystemTime(new Date("2026-08-31T23:59:59.999Z"));
    expect(getMonthStart().toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("getNextMonthStart", () => {
  it("returns midnight UTC on the 1st of the following month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    expect(getNextMonthStart().toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rolls over December to January of the next year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:59:59.999Z"));
    expect(getNextMonthStart().toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("is exactly one month after getMonthStart", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T10:00:00.000Z"));
    expect(getMonthStart().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(getNextMonthStart().toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("getUsageWindowStart", () => {
  it("returns month start when no reset marker is provided", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
    expect(getUsageWindowStart().toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(getUsageWindowStart(null).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("returns the reset marker when it is after the month start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
    const reset = new Date("2026-08-10T09:00:00.000Z");
    expect(getUsageWindowStart(reset)).toBe(reset);
  });

  it("returns the month start when the reset marker is from a previous month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
    const reset = new Date("2026-07-20T09:00:00.000Z");
    expect(getUsageWindowStart(reset).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("returns the month start when the reset marker equals it exactly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
    const reset = new Date("2026-08-01T00:00:00.000Z");
    const result = getUsageWindowStart(reset);
    // Strict > comparison: an equal marker is not "later", so month start wins.
    expect(result).not.toBe(reset);
    expect(result.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("getEffectiveMatchingLimit", () => {
  const settings: PlatformMatchingSettings = {
    verifiedMatchingRunsPerMonth: 10,
    unverifiedMatchingRunsPerMonth: 2,
  } as PlatformMatchingSettings;

  it("uses the per-company override when set", () => {
    expect(
      getEffectiveMatchingLimit(
        { matchingRunsLimit: 99, verificationStatus: "verified" },
        settings,
      ),
    ).toBe(99);
  });

  it("honors an override of 0 (null check, not falsiness)", () => {
    expect(
      getEffectiveMatchingLimit(
        { matchingRunsLimit: 0, verificationStatus: "verified" },
        settings,
      ),
    ).toBe(0);
  });

  it("falls back to the verified platform limit for verified companies", () => {
    expect(
      getEffectiveMatchingLimit(
        { matchingRunsLimit: null, verificationStatus: "verified" },
        settings,
      ),
    ).toBe(10);
  });

  it("falls back to the unverified platform limit otherwise", () => {
    expect(
      getEffectiveMatchingLimit(
        { matchingRunsLimit: null, verificationStatus: "pending_verification" },
        settings,
      ),
    ).toBe(2);
    expect(getEffectiveMatchingLimit({}, settings)).toBe(2);
    expect(
      getEffectiveMatchingLimit({ verificationStatus: null }, settings),
    ).toBe(2);
  });

  it("treats undefined matchingRunsLimit the same as null", () => {
    expect(
      getEffectiveMatchingLimit({ verificationStatus: "verified" }, settings),
    ).toBe(10);
  });
});
