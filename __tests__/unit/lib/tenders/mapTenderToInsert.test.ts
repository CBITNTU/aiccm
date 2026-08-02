import { describe, expect, it } from "vitest";
import { mapTenderToInsert, toFeedRecord } from "@/lib/tenders/mapTenderToInsert";
import type { TenderData } from "@/lib/tenders/types";

const CTX = { region: "uk", defaultCurrency: "GBP", source: "uk_find_a_tender" };

function tender(overrides: Partial<TenderData> = {}): TenderData {
  return {
    reference_number: "FTS-123",
    title: "School refurbishment",
    buyer: "Leeds Council",
    cpv_codes: ["45210000"],
    description: "Roof and window works",
    budget_min: 100000,
    budget_max: 500000,
    location: "Leeds",
    deadline: "2026-09-30T12:00:00.000Z",
    status: "open",
    publication_date: "2026-08-01T00:00:00.000Z",
    contact_info: { email: "buyer@leeds.gov.uk" },
    requirements: { insurance: "£5m" },
    documents: { noticeUrl: "https://example.com/notice" },
    ...overrides,
  };
}

describe("mapTenderToInsert", () => {
  it("maps snake_case feed fields to the camelCase insert row", () => {
    const row = mapTenderToInsert(tender(), CTX);

    expect(row).toMatchObject({
      referenceNumber: "FTS-123",
      title: "School refurbishment",
      buyer: "Leeds Council",
      cpvCodes: ["45210000"],
      description: "Roof and window works",
      budgetMin: 100000,
      budgetMax: 500000,
      location: "Leeds",
      status: "open",
      contactInfo: { email: "buyer@leeds.gov.uk" },
      requirements: { insurance: "£5m" },
      documents: { noticeUrl: "https://example.com/notice" },
    });
  });

  it("stamps region and source from the adapter context", () => {
    const row = mapTenderToInsert(tender(), CTX);
    expect(row.region).toBe("uk");
    expect(row.source).toBe("uk_find_a_tender");
  });

  it("prefers a source set by the adapter on the tender itself", () => {
    const row = mapTenderToInsert(tender({ source: "ted_eu" }), CTX);
    expect(row.source).toBe("ted_eu");
  });

  it("falls back to the context default currency only when the notice has none", () => {
    expect(mapTenderToInsert(tender({ currency: "EUR" }), CTX).currency).toBe(
      "EUR",
    );
    expect(mapTenderToInsert(tender(), CTX).currency).toBe("GBP");
    expect(
      mapTenderToInsert(tender(), { ...CTX, defaultCurrency: null }).currency,
    ).toBeNull();
  });

  it("coerces date strings to Dates and null deadline to null", () => {
    const row = mapTenderToInsert(tender(), CTX);
    expect(row.deadline).toEqual(new Date("2026-09-30T12:00:00.000Z"));
    expect(row.publicationDate).toEqual(new Date("2026-08-01T00:00:00.000Z"));

    const noDeadline = mapTenderToInsert(tender({ deadline: null }), CTX);
    expect(noDeadline.deadline).toBeNull();
  });

  it("defaults a missing publication date to now", () => {
    const before = Date.now();
    const row = mapTenderToInsert(
      tender({ publication_date: "" as unknown as string }),
      CTX,
    );
    const after = Date.now();

    const ts = (row.publicationDate as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("preserves null budgets", () => {
    const row = mapTenderToInsert(
      tender({ budget_min: null, budget_max: null }),
      CTX,
    );
    expect(row.budgetMin).toBeNull();
    expect(row.budgetMax).toBeNull();
  });
});

describe("toFeedRecord", () => {
  it("camelCases the full feed shape for API clients", () => {
    const record = toFeedRecord(
      tender({
        id: "abc",
        ocid: "ocds-1",
        external_id: "ext-1",
        source: "ted_eu",
        currency: "EUR",
      }),
    );

    expect(record).toEqual({
      id: "abc",
      ocid: "ocds-1",
      referenceNumber: "FTS-123",
      title: "School refurbishment",
      buyer: "Leeds Council",
      cpvCodes: ["45210000"],
      description: "Roof and window works",
      budgetMin: 100000,
      budgetMax: 500000,
      location: "Leeds",
      deadline: "2026-09-30T12:00:00.000Z",
      status: "open",
      publicationDate: "2026-08-01T00:00:00.000Z",
      contactInfo: { email: "buyer@leeds.gov.uk" },
      requirements: { insurance: "£5m" },
      documents: { noticeUrl: "https://example.com/notice" },
      externalId: "ext-1",
      source: "ted_eu",
      currency: "EUR",
    });
  });

  it("coalesces a missing currency to null", () => {
    expect(toFeedRecord(tender()).currency).toBeNull();
  });
});
