import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET } from "@/app/api/tenders/matches/route";
import { isCompanyMember, requireAuth } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { basicMatchTendersForCompany } from "@/lib/services/basicMatchingService";
import {
  findCurationLeaks,
  getCurationOverlay,
  type CurationOverlayEntry,
} from "@/lib/services/curatedMatches";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID } from "@/__tests__/helpers/mocks";
import { queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkSuperadminRole: vi.fn(),
}));

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
  isCompanyMember: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));

vi.mock("@/lib/services/basicMatchingService", () => ({
  basicMatchTendersForCompany: vi.fn(),
}));

// Only the overlay loader is stubbed; the SQL helpers stay real so the route's
// effective-score expression is exercised as written.
vi.mock("@/lib/services/curatedMatches", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/curatedMatches")>()),
  getCurationOverlay: vi.fn(),
}));

const mockedSelect = db.select as unknown as Mock;
const mockedBasicMatch = vi.mocked(basicMatchTendersForCompany);
const mockedOverlay = vi.mocked(getCurationOverlay);

const DEEP_ID = "t-deep";
const PINNED_ID = "t-pinned";
const ORPHAN_ID = "t-orphan";

const tenderFields = {
  title: "Deep tender",
  buyer: "Council A",
  description: "Roof works",
  location: "Leeds",
  deadline: null,
  budgetMin: null,
  budgetMax: null,
  currency: "GBP",
  status: "open",
};

function deepRow(tenderId: string, overallScore: number) {
  return {
    match: {
      id: `m-${tenderId}`,
      tenderId,
      companyId: TEST_COMPANY_ID,
      overallScore,
      capabilityScore: 30,
      experienceScore: 20,
      locationScore: 40,
      certificationScore: 10,
      matchReasons: ["real reason"],
      isBookmarked: false,
      isApplied: false,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    tender: tenderFields,
  };
}

function curation(overrides: Partial<CurationOverlayEntry> = {}): CurationOverlayEntry {
  return {
    tenderId: DEEP_ID,
    curatedScore: 92,
    pinned: false,
    pinRank: null,
    capabilityScore: 70,
    experienceScore: 88,
    locationScore: 60,
    certificationScore: 100,
    matchReasons: ["curated reason"],
    summary: "curated summary",
    ...overrides,
  };
}

function get(searchParams: Record<string, string> = {}) {
  return GET(
    makeRequest("/api/tenders/matches", {
      searchParams: { companyId: TEST_COMPANY_ID, ...searchParams },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: mockUser() } as never);
  vi.mocked(isCompanyMember).mockResolvedValue(true);
  vi.mocked(checkSuperadminRole).mockResolvedValue(false);
  mockedBasicMatch.mockResolvedValue([]);
  mockedOverlay.mockResolvedValue(new Map());
});

describe("GET /api/tenders/matches — curated overlay", () => {
  it("shows the curated score and breakdown in place of the real ones", async () => {
    mockedOverlay.mockResolvedValue(new Map([[DEEP_ID, curation()]]));
    queueSelects(
      mockedSelect,
      [{ count: 1 }], // deepMatchedCount
      [{ count: 1 }], // deepResearchedCount
      [{ count: 0 }], // ruledOutCount
      [deepRow(DEEP_ID, 12)], // deep window — real score is 12
      [], // curated ids that already have a deep row
    );

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    const results = body.results as Array<Record<string, unknown>>;
    expect(results[0]).toMatchObject({
      variant: "deep",
      tenderId: DEEP_ID,
      score: 92,
      // The breakdown has to move with the score, or the card contradicts the
      // formula it is supposedly derived from.
      capabilityScore: 70,
      certificationScore: 100,
      matchReasons: ["curated reason"],
    });
  });

  it("never lowers a match that already scores above the curation", async () => {
    mockedOverlay.mockResolvedValue(
      new Map([[DEEP_ID, curation({ curatedScore: 50 })]]),
    );
    queueSelects(
      mockedSelect,
      [{ count: 1 }],
      [{ count: 1 }],
      [{ count: 0 }],
      [deepRow(DEEP_ID, 88)],
      [],
    );

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    const results = body.results as Array<Record<string, unknown>>;
    // Floor semantics — and the real breakdown stays, since a frozen breakdown
    // solved for 50 under a shown score of 88 would contradict itself.
    expect(results[0]).toMatchObject({ score: 88, capabilityScore: 30 });
  });

  it("leaves an uncurated match completely untouched", async () => {
    queueSelects(
      mockedSelect,
      [{ count: 1 }],
      [{ count: 1 }],
      [{ count: 0 }],
      [deepRow(DEEP_ID, 61)],
    );

    const { body } = await readJson(await get());
    const results = body.results as Array<Record<string, unknown>>;
    expect(results[0]).toMatchObject({ score: 61, matchReasons: ["real reason"] });
  });

  it("puts a pinned curation first, ahead of a higher-scoring match", async () => {
    mockedOverlay.mockResolvedValue(
      new Map([
        [PINNED_ID, curation({ tenderId: PINNED_ID, curatedScore: 70, pinned: true, pinRank: 0 })],
      ]),
    );
    queueSelects(
      mockedSelect,
      [{ count: 2 }],
      [{ count: 2 }],
      [{ count: 0 }],
      [deepRow(DEEP_ID, 95)], // window, pinned excluded
      [deepRow(PINNED_ID, 40)], // pinned window
      [{ tenderId: PINNED_ID }], // curated ids that already have a deep row
    );

    const { body } = await readJson(await get());
    const results = body.results as Array<Record<string, unknown>>;
    expect(results.map((r) => r.tenderId)).toEqual([PINNED_ID, DEEP_ID]);
    expect(results[0]).toMatchObject({ score: 70 });
  });

  it("ignores the pin under an explicit sort, where it would look anomalous", async () => {
    mockedOverlay.mockResolvedValue(
      new Map([
        [PINNED_ID, curation({ tenderId: PINNED_ID, curatedScore: 70, pinned: true, pinRank: 0 })],
      ]),
    );
    queueSelects(
      mockedSelect,
      [{ count: 2 }],
      [{ count: 2 }],
      [{ count: 0 }],
      // No pinned split: with the pin inactive both rows come from one window.
      [deepRow(DEEP_ID, 95), deepRow(PINNED_ID, 40)],
      [{ tenderId: PINNED_ID }],
    );

    const { body } = await readJson(await get({ sortBy: "deadline" }));
    const results = body.results as Array<Record<string, unknown>>;
    // Ranked by the sort, not the pin — but the score floor still applies.
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.tenderId === PINNED_ID)).toMatchObject({
      score: 70,
    });
  });

  it("renders a curation whose deep row never landed", async () => {
    mockedOverlay.mockResolvedValue(
      new Map([[ORPHAN_ID, curation({ tenderId: ORPHAN_ID, curatedScore: 84 })]]),
    );
    queueSelects(
      mockedSelect,
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 0 }],
      [], // empty deep window
      [], // no curated id has a deep row
      [{ id: ORPHAN_ID, ...tenderFields, title: "Orphan tender" }],
    );

    const { body } = await readJson(await get());
    const results = body.results as Array<Record<string, unknown>>;
    // Presented as an ordinary deep card so it carries the usual badge and a
    // full breakdown, rather than announcing itself as something different.
    expect(results[0]).toMatchObject({
      variant: "deep",
      tenderId: ORPHAN_ID,
      score: 84,
      capabilityScore: 70,
    });
    expect(body.matchedCount).toBe(1);
    // There is no matching_results row behind this card, so there is nothing to
    // bookmark or delete. A placeholder id here would be cast to uuid by those
    // routes and 500; a recognisable one would also be a tell in the payload.
    expect(results[0].resultId).toBeNull();
  });

  it("keeps a curated match inside a score filter that its real score would fail", async () => {
    mockedOverlay.mockResolvedValue(new Map([[DEEP_ID, curation()]]));
    queueSelects(
      mockedSelect,
      [{ count: 1 }],
      [{ count: 1 }],
      [{ count: 0 }],
      [deepRow(DEEP_ID, 12)],
      [],
    );

    const { body } = await readJson(await get({ minScore: "80" }));

    // The SQL filter runs on the effective score, so the row survives the
    // narrowing the user applied — /api/tenders/matches and the saved list have
    // to agree on which score a filter is filtering.
    const results = body.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ score: 92 });
  });

  it("never leaks curation fields into the user-facing payload", async () => {
    mockedOverlay.mockResolvedValue(
      new Map([[DEEP_ID, curation({ pinned: true, pinRank: 0 })]]),
    );
    queueSelects(
      mockedSelect,
      [{ count: 1 }],
      [{ count: 1 }],
      [{ count: 0 }],
      [], // window (pinned excluded)
      [deepRow(DEEP_ID, 12)], // pinned window
      [{ tenderId: DEEP_ID }],
    );

    const { body } = await readJson(await get());

    // Key-level check, not a substring scan: curated *values* legitimately
    // appear in the payload — that is the point — but no curation field name
    // may, or the network response gives the whole thing away.
    expect(findCurationLeaks(body)).toEqual([]);
    expect(Object.keys((body.results as Record<string, unknown>[])[0])).toEqual(
      expect.not.arrayContaining(["pinned", "pinRank", "evidenceNote", "internalNote"]),
    );
  });
});
