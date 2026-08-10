import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET } from "@/app/api/projects/[projectId]/route";
import { isCompanyMember, requireAuth } from "@/lib/api/validation";
import { getCurationOverlay } from "@/lib/services/curatedMatches";
import { db } from "@/lib/db";
import { makeRequest, readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID } from "@/__tests__/helpers/mocks";
import { queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
  isCompanyMember: vi.fn(),
  getUserCompanyIds: vi.fn(),
}));

vi.mock("@/lib/services/curatedMatches", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/curatedMatches")>()),
  getCurationOverlay: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));

const mockedSelect = db.select as unknown as Mock;
const mockedOverlay = vi.mocked(getCurationOverlay);

const PROJECT_ID = "00000000-0000-4000-8000-0000000000a1";
const TENDER_ID = "00000000-0000-4000-8000-0000000000b1";

function get() {
  return GET(
    makeRequest(`/api/projects/${PROJECT_ID}`),
    routeParams({ projectId: PROJECT_ID }),
  );
}

/** The match row the VO panel renders as "Match score". */
function matchRow() {
  return {
    id: "match-1",
    overallScore: 12,
    capabilityScore: 30,
    experienceScore: 20,
    locationScore: 40,
    certificationScore: 10,
    matchReasons: ["real reason"],
    aiAnalysis: { analysis: "real summary" },
  };
}

function curation(overrides: Record<string, unknown> = {}) {
  return {
    tenderId: TENDER_ID,
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: mockUser() } as never);
  vi.mocked(isCompanyMember).mockResolvedValue(true);
  mockedOverlay.mockResolvedValue(new Map());
});

/**
 * Queue the project route's selects in issue order: project, team members,
 * then the tender match row.
 */
function queueProjectSelects(match: unknown[]) {
  return queueSelects(
    mockedSelect,
    [
      {
        project: {
          id: PROJECT_ID,
          leadCompanyId: TEST_COMPANY_ID,
          targetTenderId: TENDER_ID,
        },
        tenderData: { id: TENDER_ID, title: "Bridge works" },
      },
    ],
    [], // team members
    match,
  );
}

describe("GET /api/projects/[projectId] — curated match overlay", () => {
  it("reports the curated score, not the raw one", async () => {
    mockedOverlay.mockResolvedValue(new Map([[TENDER_ID, curation()]]));
    queueProjectSelects([matchRow()]);

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    // GapAnalysisPanel renders this for the same company/tender pair the feed
    // already showed. Reading matching_results directly here meant a user who
    // started a project from a curated tender saw 12% next to the feed's 92%.
    expect(body.tenderMatchResult).toMatchObject({
      overallScore: 92,
      capabilityScore: 70,
      certificationScore: 100,
      matchReasons: ["curated reason"],
      aiAnalysis: { analysis: "curated summary" },
    });
  });

  it("leaves an uncurated match untouched", async () => {
    queueProjectSelects([matchRow()]);

    const { body } = await readJson(await get());

    expect(body.tenderMatchResult).toMatchObject({
      overallScore: 12,
      capabilityScore: 30,
      matchReasons: ["real reason"],
      aiAnalysis: { analysis: "real summary" },
    });
  });

  it("keeps the real numbers once they overtake the curated floor", async () => {
    mockedOverlay.mockResolvedValue(
      new Map([[TENDER_ID, curation({ curatedScore: 80 })]]),
    );
    queueProjectSelects([{ ...matchRow(), overallScore: 95, capabilityScore: 90 }]);

    const { body } = await readJson(await get());

    // Curation is a floor, never a ceiling — and the narrative moves with the
    // numbers rather than sitting on top of them.
    expect(body.tenderMatchResult).toMatchObject({
      overallScore: 95,
      capabilityScore: 90,
      matchReasons: ["real reason"],
      aiAnalysis: { analysis: "real summary" },
    });
  });

  it("does not query the overlay when the project targets no tender", async () => {
    queueSelects(
      mockedSelect,
      [
        {
          project: {
            id: PROJECT_ID,
            leadCompanyId: TEST_COMPANY_ID,
            targetTenderId: null,
          },
          tenderData: null,
        },
      ],
      [],
    );

    const { body } = await readJson(await get());

    expect(body.tenderMatchResult).toBeNull();
    expect(mockedOverlay).not.toHaveBeenCalled();
  });
});
