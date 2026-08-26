import { describe, it, expect } from "vitest";
import { checkMatchingReadiness } from "@/lib/matchingReadiness";
import type { CompanyRecord } from "@/lib/api/types";

function makeCompany(overrides: Partial<CompanyRecord> = {}): CompanyRecord {
  return {
    id: "company-1",
    userId: "user-1",
    companyName: "Test Co",
    companiesHouseNumber: null,
    logoUrl: null,
    websiteUrl: null,
    contactPerson: null,
    contactEmail: null,
    contactPhone: null,
    description: null,
    keyCapabilities: null,
    certifications: null,
    equipment: null,
    pastProjects: null,
    operationLocations: null,
    address: null,
    postcode: null,
    status: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    aiSummary: null,
    aiCapabilityTaxonomy: null,
    pendingChanges: null,
    ...overrides,
  };
}

function fieldByName(
  result: ReturnType<typeof checkMatchingReadiness>,
  name: string,
) {
  const field = result.fields.find((f) => f.name === name);
  if (!field) throw new Error(`Field not found: ${name}`);
  return field;
}

describe("checkMatchingReadiness", () => {
  it("returns all seven fields in order", () => {
    const result = checkMatchingReadiness(makeCompany());
    expect(result.fields.map((f) => f.name)).toEqual([
      "Company Description",
      "Key Capabilities",
      "Location",
      "Certifications",
      "Company AI Analysis",
      "Past Projects",
      "Industry Category",
    ]);
    expect(result.fields.map((f) => f.required)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  describe("Company Description", () => {
    it("is filled when description is longer than 20 chars after trim", () => {
      const result = checkMatchingReadiness(
        makeCompany({ description: "a".repeat(21) }),
      );
      const field = fieldByName(result, "Company Description");
      expect(field.status).toBe("filled");
      expect(field.description).toBe("Description is filled");
    });

    it("is missing at exactly 20 chars (boundary is strict)", () => {
      const result = checkMatchingReadiness(
        makeCompany({ description: "a".repeat(20) }),
      );
      expect(fieldByName(result, "Company Description").status).toBe("missing");
    });

    it("trims whitespace before measuring length", () => {
      const padded = `   ${"a".repeat(20)}   `;
      const result = checkMatchingReadiness(makeCompany({ description: padded }));
      expect(fieldByName(result, "Company Description").status).toBe("missing");
    });

    it("is partial when only an aiSummary longer than 20 chars exists", () => {
      const result = checkMatchingReadiness(
        makeCompany({ aiSummary: "b".repeat(21) }),
      );
      const field = fieldByName(result, "Company Description");
      expect(field.status).toBe("partial");
      expect(field.description).toContain("AI summary available");
    });

    it("is missing when aiSummary is exactly 20 chars", () => {
      const result = checkMatchingReadiness(
        makeCompany({ aiSummary: "b".repeat(20) }),
      );
      expect(fieldByName(result, "Company Description").status).toBe("missing");
    });

    it("is missing when both description and aiSummary are absent", () => {
      const result = checkMatchingReadiness(makeCompany());
      const field = fieldByName(result, "Company Description");
      expect(field.status).toBe("missing");
      expect(field.description).toContain("Edit Overview");
    });

    it("prefers filled over partial when both exist", () => {
      const result = checkMatchingReadiness(
        makeCompany({ description: "a".repeat(21), aiSummary: "b".repeat(21) }),
      );
      expect(fieldByName(result, "Company Description").status).toBe("filled");
    });
  });

  describe("Key Capabilities", () => {
    it("is filled when keyCapabilities is longer than 10 chars", () => {
      const result = checkMatchingReadiness(
        makeCompany({ keyCapabilities: "c".repeat(11) }),
      );
      const field = fieldByName(result, "Key Capabilities");
      expect(field.status).toBe("filled");
      expect(field.description).toBe("Capabilities are filled");
    });

    it("is missing at exactly 10 chars (boundary is strict)", () => {
      const result = checkMatchingReadiness(
        makeCompany({ keyCapabilities: "c".repeat(10) }),
      );
      expect(fieldByName(result, "Key Capabilities").status).toBe("missing");
    });

    it("is filled via structured capabilitiesCount alone", () => {
      const result = checkMatchingReadiness(makeCompany(), {
        capabilitiesCount: 1,
      });
      const field = fieldByName(result, "Key Capabilities");
      expect(field.status).toBe("filled");
      expect(field.description).toBe("1 competency selected");
    });

    it("pluralizes competencies for count > 1", () => {
      const result = checkMatchingReadiness(makeCompany(), {
        capabilitiesCount: 3,
      });
      expect(fieldByName(result, "Key Capabilities").description).toBe(
        "3 competencies selected",
      );
    });

    it("combines free-text and structured counts in the description", () => {
      const result = checkMatchingReadiness(
        makeCompany({ keyCapabilities: "c".repeat(11) }),
        { capabilitiesCount: 2 },
      );
      expect(fieldByName(result, "Key Capabilities").description).toBe(
        "Capabilities listed and 2 competencies selected",
      );
    });

    it("is partial when only aiCapabilityTaxonomy is a non-empty array", () => {
      const result = checkMatchingReadiness(
        makeCompany({ aiCapabilityTaxonomy: [{ area: "civil" }] }),
      );
      const field = fieldByName(result, "Key Capabilities");
      expect(field.status).toBe("partial");
      expect(field.description).toContain("AI-extracted capabilities");
    });

    it("is missing when aiCapabilityTaxonomy is an empty array", () => {
      const result = checkMatchingReadiness(
        makeCompany({ aiCapabilityTaxonomy: [] }),
      );
      expect(fieldByName(result, "Key Capabilities").status).toBe("missing");
    });
  });

  describe("Location", () => {
    it("is filled when postcode is set", () => {
      const result = checkMatchingReadiness(makeCompany({ postcode: "SW1A 1AA" }));
      const field = fieldByName(result, "Location");
      expect(field.status).toBe("filled");
      expect(field.description).toBe("Postcode is set");
    });

    it("is partial when only address is set", () => {
      const result = checkMatchingReadiness(makeCompany({ address: "1 Main St" }));
      expect(fieldByName(result, "Location").status).toBe("partial");
    });

    it("is partial when only operationLocations is a non-empty array", () => {
      const result = checkMatchingReadiness(
        makeCompany({ operationLocations: ["London"] }),
      );
      expect(fieldByName(result, "Location").status).toBe("partial");
    });

    it("is missing with empty operationLocations and no address/postcode", () => {
      const result = checkMatchingReadiness(
        makeCompany({ operationLocations: [] }),
      );
      expect(fieldByName(result, "Location").status).toBe("missing");
    });
  });

  describe("Certifications", () => {
    it("is filled when free-text certifications exceed 5 chars", () => {
      const result = checkMatchingReadiness(
        makeCompany({ certifications: "d".repeat(6) }),
      );
      const field = fieldByName(result, "Certifications");
      expect(field.status).toBe("filled");
      expect(field.description).toBe("Certifications are listed");
    });

    it("is missing at exactly 5 chars (boundary is strict)", () => {
      const result = checkMatchingReadiness(
        makeCompany({ certifications: "d".repeat(5) }),
      );
      expect(fieldByName(result, "Certifications").status).toBe("missing");
    });

    it("is filled via structured standardsCount alone, singular wording", () => {
      const result = checkMatchingReadiness(makeCompany(), { standardsCount: 1 });
      const field = fieldByName(result, "Certifications");
      expect(field.status).toBe("filled");
      expect(field.description).toBe("1 standard selected");
    });

    it("combines free-text and structured counts, plural wording", () => {
      const result = checkMatchingReadiness(
        makeCompany({ certifications: "ISO 9001" }),
        { standardsCount: 2 },
      );
      expect(fieldByName(result, "Certifications").description).toBe(
        "Certifications listed and 2 standards selected",
      );
    });
  });

  describe("Company AI Analysis", () => {
    it("is filled when aiSummary exceeds 20 chars", () => {
      const result = checkMatchingReadiness(
        makeCompany({ aiSummary: "e".repeat(21) }),
      );
      expect(fieldByName(result, "Company AI Analysis").status).toBe("filled");
    });

    it("is missing when aiSummary is exactly 20 chars (shares description threshold)", () => {
      const result = checkMatchingReadiness(
        makeCompany({ aiSummary: "e".repeat(20) }),
      );
      expect(fieldByName(result, "Company AI Analysis").status).toBe("missing");
    });
  });

  describe("Past Projects", () => {
    it("is filled for a JSON array with entries", () => {
      const result = checkMatchingReadiness(
        makeCompany({ pastProjects: JSON.stringify([{ title: "Bridge" }]) }),
      );
      expect(fieldByName(result, "Past Projects").status).toBe("filled");
    });

    it("is missing for an empty JSON array", () => {
      const result = checkMatchingReadiness(makeCompany({ pastProjects: "[]" }));
      expect(fieldByName(result, "Past Projects").status).toBe("missing");
    });

    it("falls back to legacy plain text longer than 10 chars", () => {
      const result = checkMatchingReadiness(
        makeCompany({ pastProjects: "Built roads for the council" }),
      );
      expect(fieldByName(result, "Past Projects").status).toBe("filled");
    });

    it("is missing for legacy plain text of exactly 10 chars", () => {
      // "Built road" is 10 chars and not valid JSON -> legacy branch, > 10 fails.
      const result = checkMatchingReadiness(
        makeCompany({ pastProjects: "Built road" }),
      );
      expect(fieldByName(result, "Past Projects").status).toBe("missing");
    });

    it("is missing for whitespace-only pastProjects", () => {
      const result = checkMatchingReadiness(makeCompany({ pastProjects: "   " }));
      expect(fieldByName(result, "Past Projects").status).toBe("missing");
    });

    it("treats JSON-parseable non-array text as missing even when long", () => {
      // Quirk pinned: a long numeric string parses as a JSON number, so the
      // legacy plain-text fallback never runs and the field counts as missing.
      const result = checkMatchingReadiness(
        makeCompany({ pastProjects: "123456789012345" }),
      );
      expect(fieldByName(result, "Past Projects").status).toBe("missing");
    });
  });

  describe("Industry Category", () => {
    it("is missing when taxonomyCount is 0 or options are omitted", () => {
      expect(
        fieldByName(checkMatchingReadiness(makeCompany()), "Industry Category")
          .status,
      ).toBe("missing");
      expect(
        fieldByName(
          checkMatchingReadiness(makeCompany(), { taxonomyCount: 0 }),
          "Industry Category",
        ).status,
      ).toBe("missing");
    });

    it("is filled with singular wording for one category", () => {
      const field = fieldByName(
        checkMatchingReadiness(makeCompany(), { taxonomyCount: 1 }),
        "Industry Category",
      );
      expect(field.status).toBe("filled");
      expect(field.description).toBe("1 industry category selected");
    });

    it("is filled with plural wording for multiple categories", () => {
      const field = fieldByName(
        checkMatchingReadiness(makeCompany(), { taxonomyCount: 4 }),
        "Industry Category",
      );
      expect(field.description).toBe("4 industry categories selected");
    });
  });

  describe("pendingChanges warning", () => {
    it("warns when pendingChanges is a non-empty object", () => {
      const result = checkMatchingReadiness(
        makeCompany({ pendingChanges: { description: "new" } }),
      );
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("pending changes awaiting verification");
    });

    it("does not warn for an empty object", () => {
      const result = checkMatchingReadiness(makeCompany({ pendingChanges: {} }));
      expect(result.warnings).toEqual([]);
    });

    it("does not warn for null pendingChanges", () => {
      const result = checkMatchingReadiness(makeCompany({ pendingChanges: null }));
      expect(result.warnings).toEqual([]);
    });
  });

  describe("ready derivation", () => {
    it("is not ready when all fields are missing", () => {
      expect(checkMatchingReadiness(makeCompany()).ready).toBe(false);
    });

    it("is ready when all required fields are filled, regardless of recommended fields", () => {
      const result = checkMatchingReadiness(
        makeCompany({
          description: "a".repeat(21),
          keyCapabilities: "c".repeat(11),
          postcode: "SW1A 1AA",
        }),
      );
      expect(result.ready).toBe(true);
    });

    it("counts partial required fields as ready", () => {
      const result = checkMatchingReadiness(
        makeCompany({
          aiSummary: "b".repeat(21), // description: partial
          aiCapabilityTaxonomy: [{ area: "civil" }], // capabilities: partial
          address: "1 Main St", // location: partial
        }),
      );
      expect(result.ready).toBe(true);
    });

    it("is not ready when any single required field is missing", () => {
      const base = {
        description: "a".repeat(21),
        keyCapabilities: "c".repeat(11),
        postcode: "SW1A 1AA",
      };
      expect(
        checkMatchingReadiness(makeCompany({ ...base, description: null })).ready,
      ).toBe(false);
      expect(
        checkMatchingReadiness(makeCompany({ ...base, keyCapabilities: null }))
          .ready,
      ).toBe(false);
      expect(
        checkMatchingReadiness(makeCompany({ ...base, postcode: null })).ready,
      ).toBe(false);
    });

    it("ignores recommended fields for readiness", () => {
      const result = checkMatchingReadiness(
        makeCompany({
          description: "a".repeat(21),
          keyCapabilities: "c".repeat(11),
          postcode: "SW1A 1AA",
          certifications: null,
          pastProjects: null,
        }),
        { taxonomyCount: 0, standardsCount: 0 },
      );
      expect(result.ready).toBe(true);
      expect(
        result.fields.filter((f) => !f.required).every((f) => f.status === "missing"),
      ).toBe(true);
    });
  });
});
