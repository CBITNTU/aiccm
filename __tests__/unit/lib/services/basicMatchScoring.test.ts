import { describe, expect, it } from "vitest";
import {
  DOMAIN_MISMATCH_PENALTY,
  bandFor,
  capabilityTokens,
  companyQueryText,
  domainMismatchPenalty,
  fusionScore,
  normaliseForMatch,
  tenderMatchesCapability,
} from "@/lib/services/basicMatchScoring";
import type { CompanyMatchContext } from "@/lib/services/basicMatchContext";

describe("bandFor", () => {
  it("returns high at or above the high threshold (default 0.72)", () => {
    expect(bandFor(0.72)).toBe("high");
    expect(bandFor(0.9)).toBe("high");
  });

  it("returns medium between the thresholds (default [0.55, 0.72))", () => {
    expect(bandFor(0.7199)).toBe("medium");
    expect(bandFor(0.55)).toBe("medium");
  });

  it("returns low below the medium threshold", () => {
    expect(bandFor(0.5499)).toBe("low");
    expect(bandFor(0)).toBe("low");
  });

  it("honours custom thresholds", () => {
    expect(bandFor(0.6, 0.6, 0.3)).toBe("high");
    expect(bandFor(0.3, 0.6, 0.3)).toBe("medium");
    expect(bandFor(0.29, 0.6, 0.3)).toBe("low");
  });
});

describe("normaliseForMatch", () => {
  it("lowercases and collapses internal whitespace", () => {
    expect(normaliseForMatch("Civil\t Engineering\n Works")).toBe(
      "civil engineering works",
    );
  });

  it("collapses but does not trim leading/trailing whitespace", () => {
    // Documents current behaviour: runs collapse to a single space, so
    // surrounding whitespace survives as one leading/trailing space.
    expect(normaliseForMatch("  Demolition  ")).toBe(" demolition ");
  });
});

describe("capabilityTokens", () => {
  it("returns the whole normalised label when it is 3 chars or fewer", () => {
    expect(capabilityTokens("CNC")).toEqual(["cnc"]);
    expect(capabilityTokens("IT")).toEqual(["it"]);
  });

  it("splits on non-alphanumerics and keeps tokens of 4+ chars", () => {
    expect(capabilityTokens("Civil Engineering")).toEqual([
      "civil",
      "engineering",
    ]);
    expect(capabilityTokens("design-build works")).toEqual([
      "design",
      "build",
      "works",
    ]);
  });

  it("drops short tokens from longer labels", () => {
    // "IT" is dropped (<4 chars) once the label itself is longer than 3 chars.
    expect(capabilityTokens("IT support")).toEqual(["support"]);
  });
});

describe("tenderMatchesCapability", () => {
  it("matches when a capability token appears in the tender text", () => {
    expect(
      tenderMatchesCapability("Major demolition works in Leeds", [
        "Demolition services",
      ]),
    ).toBe(true);
  });

  it("does not match when no tokens appear", () => {
    expect(
      tenderMatchesCapability("Catering services for schools", [
        "Civil Engineering",
      ]),
    ).toBe(false);
  });

  it("returns false for an empty capability list", () => {
    expect(tenderMatchesCapability("Anything at all", [])).toBe(false);
  });

  it("matches when a label's full phrase appears verbatim in the tender text", () => {
    expect(
      tenderMatchesCapability("civil engineering framework", [
        "Civil Engineering",
      ]),
    ).toBe(true);
  });
});

describe("domainMismatchPenalty", () => {
  it("returns 0 when the company has no capability labels", () => {
    expect(domainMismatchPenalty("construction of a school", [])).toBe(0);
  });

  it("returns 0 when the tender mentions no rule domain", () => {
    expect(
      domainMismatchPenalty("catering services", ["Software development"]),
    ).toBe(0);
  });

  it("penalises a construction tender for a non-construction company", () => {
    expect(
      domainMismatchPenalty("construction of a new school", [
        "Software development",
      ]),
    ).toBe(DOMAIN_MISMATCH_PENALTY);
  });

  it("does not penalise when the company covers the domain", () => {
    expect(
      domainMismatchPenalty("construction of a new school", [
        "Civil engineering",
      ]),
    ).toBe(0);
    expect(
      domainMismatchPenalty("demolition of a warehouse", ["Building works"]),
    ).toBe(0.08); // "building" covers construction but not the demolition rule
    expect(
      domainMismatchPenalty("demolition of a warehouse", ["Demolition"]),
    ).toBe(0);
  });

  it("applies the surveying rule via any of its needles", () => {
    expect(
      domainMismatchPenalty("land surveying contract", ["Geospatial analysis"]),
    ).toBe(0);
    expect(
      domainMismatchPenalty("land surveying contract", ["Catering"]),
    ).toBe(DOMAIN_MISMATCH_PENALTY);
  });
});

describe("fusionScore", () => {
  const base = {
    vectorSimilarity: 0.8,
    cpvScore: 1,
    taxonomyScore: 0.5,
    locationScore: 1,
    capabilityMatch: false,
    domainPenalty: 0,
  };

  it("blends 0.5·vector + 0.15·cpv + 0.15·taxonomy + 0.1·location", () => {
    expect(fusionScore(base)).toBeCloseTo(
      0.5 * 0.8 + 0.15 * 1 + 0.15 * 0.5 + 0.1 * 1,
    );
  });

  it("adds 0.08 for a capability match", () => {
    expect(fusionScore({ ...base, capabilityMatch: true })).toBeCloseTo(
      fusionScore(base) + 0.08,
    );
  });

  it("subtracts the domain penalty", () => {
    expect(fusionScore({ ...base, domainPenalty: 0.08 })).toBeCloseTo(
      fusionScore(base) - 0.08,
    );
  });

  it("tops out at 0.98 for perfect inputs (0.9 blend + 0.08 bonus)", () => {
    expect(
      fusionScore({
        vectorSimilarity: 1,
        cpvScore: 1,
        taxonomyScore: 1,
        locationScore: 1,
        capabilityMatch: true,
        domainPenalty: 0,
      }),
    ).toBeCloseTo(0.98);
  });

  it("clamps to [0, 1]", () => {
    // An out-of-range vector similarity is clamped at the top…
    expect(
      fusionScore({
        vectorSimilarity: 2,
        cpvScore: 1,
        taxonomyScore: 1,
        locationScore: 1,
        capabilityMatch: true,
        domainPenalty: 0,
      }),
    ).toBe(1);
    expect(
      fusionScore({
        vectorSimilarity: 0,
        cpvScore: 0,
        taxonomyScore: 0,
        locationScore: 0,
        capabilityMatch: false,
        domainPenalty: 0.08,
      }),
    ).toBe(0);
  });
});

describe("companyQueryText", () => {
  function ctx(overrides: Partial<CompanyMatchContext> = {}): CompanyMatchContext {
    return {
      companyId: "c1",
      capabilityLabels: [],
      taxonomyIds: [],
      taxonomyNames: [],
      locationText: "",
      cpvDivisions: [],
      hasTaxonomies: false,
      ...overrides,
    };
  }

  it("joins capabilities, taxonomies and location with newlines", () => {
    expect(
      companyQueryText(
        ctx({
          capabilityLabels: ["Civil Engineering", "Demolition"],
          taxonomyNames: ["Construction works"],
          locationText: "Leeds LS1",
        }),
      ),
    ).toBe("Civil Engineering; Demolition\nConstruction works\nLeeds LS1");
  });

  it("omits empty sections entirely", () => {
    expect(companyQueryText(ctx({ locationText: "Leeds" }))).toBe("Leeds");
    expect(companyQueryText(ctx())).toBe("");
  });
});
