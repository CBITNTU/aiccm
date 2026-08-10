import { describe, it, expect } from "vitest";
import {
  getCpvCodeName,
  formatCpvCode,
  cpvDivision,
  inferCpvDivisionsFromText,
} from "@/lib/cpvCodes";

describe("getCpvCodeName", () => {
  it("returns the exact match when the code is known", () => {
    expect(getCpvCodeName("45000000")).toBe("Construction work");
    expect(getCpvCodeName("72200000")).toBe(
      "Software programming and consultancy services",
    );
  });

  it("pads short codes to 8 digits to find a parent", () => {
    expect(getCpvCodeName("45")).toBe("Construction work");
    expect(getCpvCodeName("451")).toBe("Site preparation work");
    expect(getCpvCodeName("713")).toBe("Engineering services");
  });

  it("strips a check-digit suffix via the 8-char substring", () => {
    expect(getCpvCodeName("45000000-7")).toBe("Construction work");
    expect(getCpvCodeName("71300000-1")).toBe("Engineering services");
  });

  it("falls back to the nearest known ancestor for unknown 8-digit codes", () => {
    // 45211300 → 45211000 → 45210000 → 45200000 (known group)
    expect(getCpvCodeName("45211300")).toBe(
      "Works for complete or part construction and civil engineering work",
    );
    // 71540000 has no known group, so it climbs to division 71000000
    expect(getCpvCodeName("71540000")).toBe(
      "Architectural, construction, engineering and inspection services",
    );
  });

  it("returns 'CPV <code>' when nothing matches", () => {
    expect(getCpvCodeName("99999999")).toBe("CPV 99999999");
    expect(getCpvCodeName("12")).toBe("CPV 12");
  });
});

describe("formatCpvCode", () => {
  it("returns the original code with its resolved name", () => {
    expect(formatCpvCode("45000000")).toEqual({
      code: "45000000",
      name: "Construction work",
    });
  });

  it("keeps the code verbatim even when unresolved", () => {
    expect(formatCpvCode("99999999")).toEqual({
      code: "99999999",
      name: "CPV 99999999",
    });
  });
});

describe("cpvDivision", () => {
  it("returns the first two digits of a full code", () => {
    expect(cpvDivision("45211300")).toBe("45");
    expect(cpvDivision("71300000")).toBe("71");
  });

  it("strips non-digit characters before slicing", () => {
    expect(cpvDivision("45211300-9")).toBe("45");
    expect(cpvDivision("CPV 72000000")).toBe("72");
  });

  it("returns the remaining digits when fewer than two exist", () => {
    expect(cpvDivision("4")).toBe("4");
    expect(cpvDivision("")).toBe("");
    expect(cpvDivision("abc")).toBe("");
    expect(cpvDivision("a5b")).toBe("5");
  });

  it("returns exactly two digits at the boundary", () => {
    expect(cpvDivision("45")).toBe("45");
  });
});

describe("inferCpvDivisionsFromText", () => {
  it("matches division 45 for construction terms", () => {
    expect(inferCpvDivisionsFromText("Heavy Construction firm")).toEqual(["45"]);
    expect(inferCpvDivisionsFromText("civil engineering and demolition")).toEqual([
      "45",
    ]);
    expect(inferCpvDivisionsFromText("scaffolding hire")).toEqual(["45"]);
  });

  it("matches division 71 for survey/architecture terms", () => {
    expect(inferCpvDivisionsFromText("land survey services")).toEqual(["71"]);
    expect(inferCpvDivisionsFromText("geospatial mapping")).toEqual(["71"]);
    expect(inferCpvDivisionsFromText("we are an architect practice")).toEqual([
      "71",
    ]);
  });

  it("matches division 80 for education terms", () => {
    expect(inferCpvDivisionsFromText("vocational training provider")).toEqual([
      "80",
    ]);
    expect(inferCpvDivisionsFromText("school teaching")).toEqual(["80"]);
  });

  it("matches division 85 for health terms", () => {
    expect(inferCpvDivisionsFromText("NHS supplier")).toEqual(["85"]);
    expect(inferCpvDivisionsFromText("social care and medical support")).toEqual([
      "85",
    ]);
  });

  it("matches division 72 for software/IT terms", () => {
    expect(inferCpvDivisionsFromText("software house")).toEqual(["72"]);
    expect(inferCpvDivisionsFromText("cyber and data platform work")).toEqual([
      "72",
    ]);
    expect(inferCpvDivisionsFromText("managed IT services")).toEqual(["72"]);
  });

  it("matches division 90 for environmental terms", () => {
    expect(inferCpvDivisionsFromText("waste and refuse collection")).toEqual([
      "90",
    ]);
    expect(inferCpvDivisionsFromText("industrial cleaning")).toEqual(["90"]);
  });

  it("matches division 50 for maintenance terms", () => {
    expect(inferCpvDivisionsFromText("planned maintenance")).toEqual(["50"]);
    expect(inferCpvDivisionsFromText("repair contracts")).toEqual(["50"]);
  });

  it("matches division 79 for business-services terms", () => {
    expect(inferCpvDivisionsFromText("management consulting")).toEqual(["79"]);
    expect(inferCpvDivisionsFromText("recruitment agency")).toEqual(["79"]);
    expect(inferCpvDivisionsFromText("business services provider")).toEqual([
      "79",
    ]);
  });

  it("is case-insensitive via lowercasing", () => {
    expect(inferCpvDivisionsFromText("CONSTRUCTION AND MAINTENANCE")).toEqual([
      "45",
      "50",
    ]);
  });

  it("collects multiple divisions and dedupes repeated hits", () => {
    const result = inferCpvDivisionsFromText(
      "construction, demolition, software, digital, training and training",
    );
    expect(result).toEqual(["45", "80", "72"]);
    expect(new Set(result).size).toBe(result.length);
  });

  it("respects word boundaries (no substring matches)", () => {
    // "surveying" does not match \b(survey)\b, "healthcare" not \b(health)\b.
    expect(inferCpvDivisionsFromText("surveying and healthcare")).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(inferCpvDivisionsFromText("bakery and florist")).toEqual([]);
    expect(inferCpvDivisionsFromText("")).toEqual([]);
  });
});
