import { describe, expect, it, vi } from "vitest";

// Pure-function tests only — stub the IO seams so importing the module is safe
// and the taxonomy/location logic doesn't depend on the deployment env.
vi.mock("@/lib/db", () => ({ db: {} }));

vi.mock("@/lib/services/embeddingService", () => ({
  fetchCompanyCapabilityLabels: vi.fn(),
  resolveCapabilityNamesByIds: vi.fn(),
}));

// Fixed profile: CPV taxonomy provider + a known locationTerms list.
vi.mock("@/lib/deployment", () => ({
  getActiveProfile: vi.fn(() => ({
    taxonomy: "cpv_eic",
    locationTerms: ["london", "manchester", "leeds"],
  })),
}));

import {
  cpvOverlapScore,
  locationOverlapScore,
  taxonomyOverlapScore,
} from "@/lib/services/basicMatchContext";

describe("taxonomyOverlapScore", () => {
  it("returns the neutral 0.5 when the company has no taxonomies", () => {
    expect(taxonomyOverlapScore([], ["t1"])).toBe(0.5);
  });

  it("returns the neutral 0.5 when the tender has no taxonomies", () => {
    expect(taxonomyOverlapScore(["t1"], [])).toBe(0.5);
  });

  it("returns 0 when both sides have taxonomies but none are shared", () => {
    expect(taxonomyOverlapScore(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("scores shared / min(companyCount, 3)", () => {
    expect(taxonomyOverlapScore(["a", "b", "c"], ["a"])).toBeCloseTo(1 / 3);
    expect(taxonomyOverlapScore(["a", "b"], ["a"])).toBeCloseTo(1 / 2);
  });

  it("returns 1 when the company's single taxonomy is shared", () => {
    expect(taxonomyOverlapScore(["a"], ["a", "b", "c"])).toBe(1);
  });

  it("caps the denominator at 3 for large company lists", () => {
    // 2 shared out of 5 company taxonomies → 2/min(5,3) = 2/3, not 2/5.
    expect(
      taxonomyOverlapScore(["a", "b", "c", "d", "e"], ["a", "b"]),
    ).toBeCloseTo(2 / 3);
  });

  it("caps the score at 1 when shared exceeds the denominator", () => {
    // 4 shared, denominator min(5,3)=3 → 4/3 clamped to 1.
    expect(
      taxonomyOverlapScore(["a", "b", "c", "d", "e"], ["a", "b", "c", "d"]),
    ).toBe(1);
  });
});

describe("cpvOverlapScore (cpv_eic provider)", () => {
  it("returns the neutral 0.5 when the tender has no CPV codes", () => {
    expect(cpvOverlapScore(["45"], null)).toBe(0.5);
    expect(cpvOverlapScore(["45"], [])).toBe(0.5);
  });

  it("returns the neutral 0.5 when the company has no divisions", () => {
    expect(cpvOverlapScore([], ["45210000"])).toBe(0.5);
  });

  it("returns 1 when any tender code falls in a company division", () => {
    expect(cpvOverlapScore(["45"], ["45210000"])).toBe(1);
    expect(cpvOverlapScore(["71", "45"], ["90000000", "45262600"])).toBe(1);
  });

  it("returns 0.15 when divisions are disjoint", () => {
    expect(cpvOverlapScore(["45"], ["71310000"])).toBe(0.15);
  });
});

describe("locationOverlapScore", () => {
  it("returns the neutral 0.5 when either side is blank", () => {
    expect(locationOverlapScore("", "London")).toBe(0.5);
    expect(locationOverlapScore("   ", "London")).toBe(0.5);
    expect(locationOverlapScore("London", null)).toBe(0.5);
    expect(locationOverlapScore("London", "  ")).toBe(0.5);
  });

  it("returns 1 when both sides share a known location term (case-insensitive)", () => {
    expect(locationOverlapScore("Office in LONDON", "Greater London")).toBe(1);
    expect(locationOverlapScore("Manchester M1 1AA", "manchester")).toBe(1);
  });

  it("returns 0.35 when both sides have known terms but none are shared", () => {
    expect(locationOverlapScore("London office", "Leeds city centre")).toBe(
      0.35,
    );
  });

  it("falls back to 0.85 substring containment when a side has no known terms", () => {
    // Neither "Bristol" nor "Bristol and Bath" contain a profile term; one
    // contains the other.
    expect(locationOverlapScore("Bristol and Bath", "Bristol")).toBe(0.85);
    expect(locationOverlapScore("Bristol", "Bristol and Bath")).toBe(0.85);
  });

  it("returns the neutral 0.5 when no terms match and no containment", () => {
    expect(locationOverlapScore("Bristol", "Newcastle")).toBe(0.5);
  });

  it("matches whole words only — 'Londonderry' is not 'London'", () => {
    // "londonderry" contains "london" as a substring but not on a word
    // boundary, so the company yields no terms; with no containment either,
    // the score stays neutral instead of claiming a London match.
    expect(locationOverlapScore("Londonderry", "London area")).toBe(0.5);
  });
});
