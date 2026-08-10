import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET } from "@/app/api/tenders/[tenderId]/match/route";
import { isCompanyMember, requireAuth } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { db } from "@/lib/db";
import { makeRequest, readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID } from "@/__tests__/helpers/mocks";
import { makeChain } from "@/__tests__/helpers/drizzleMock";

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

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedIsCompanyMember = isCompanyMember as unknown as Mock;
const mockedCheckSuperadminRole = checkSuperadminRole as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;

const TENDER_ID = "00000000-0000-4000-8000-0000000000b1";
const MATCH_ROW = { id: "match-1", overallScore: 78 };

function get(searchParams: Record<string, string> = {}) {
  return GET(
    makeRequest(`/api/tenders/${TENDER_ID}/match`, { searchParams }),
    routeParams({ tenderId: TENDER_ID }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireAuth.mockResolvedValue({ user: mockUser() });
  mockedIsCompanyMember.mockResolvedValue(true);
  mockedCheckSuperadminRole.mockResolvedValue(false);
  mockedSelect.mockImplementation(() => makeChain(() => [MATCH_ROW]));
});

describe("GET /api/tenders/[tenderId]/match", () => {
  it("returns 400 when companyId is missing", async () => {
    const { status, body } = await readJson(await get());

    expect(status).toBe(400);
    expect(body.error).toBe("companyId is required");
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("returns 401 for a non-member who is not a superadmin", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);

    const { status, body } = await readJson(
      await get({ companyId: TEST_COMPANY_ID }),
    );

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("returns the deep-match detail to a superadmin non-member", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);
    mockedCheckSuperadminRole.mockResolvedValue(true);

    const { status, body } = await readJson(
      await get({ companyId: TEST_COMPANY_ID }),
    );

    expect(status).toBe(200);
    // The curated overlay normalizes every score field onto the response, so a
    // match with no curation reports explicit nulls rather than omitting them.
    expect(body.match).toMatchObject({ id: "match-1", overallScore: 78 });
    expect(body.match).not.toHaveProperty("curation");
  });

  it("returns a null match rather than 404 when none exists", async () => {
    mockedSelect.mockImplementation(() => makeChain(() => []));

    const { status, body } = await readJson(
      await get({ companyId: TEST_COMPANY_ID }),
    );

    expect(status).toBe(200);
    expect(body.match).toBeNull();
  });

  it("synthesizes the detail from a curation whose deep row never landed", async () => {
    // First select (the deep row + join) misses; the second is the curation
    // lookup. Without this the feed shows an 84% card that opens onto a page
    // with no score at all.
    const results: unknown[][] = [
      [],
      [
        {
          curatedScore: 84,
          capabilityScore: 70,
          experienceScore: 80,
          locationScore: 60,
          certificationScore: 90,
          matchReasons: ["curated reason"],
          summary: "curated summary",
          publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    ];
    mockedSelect.mockImplementation(() => makeChain(() => results.shift() ?? []));

    const { status, body } = await readJson(
      await get({ companyId: TEST_COMPANY_ID }),
    );

    expect(status).toBe(200);
    expect(body.match).toMatchObject({
      overallScore: 84,
      capabilityScore: 70,
      certificationScore: 90,
      matchReasons: ["curated reason"],
      // Shaped like the column scoreTenderMatch writes, so the page cannot tell
      // a synthesized record from a real one.
      aiAnalysis: { analysis: "curated summary" },
    });
  });

  it("does not synthesize from a pin-only curation, which carries no score", async () => {
    const results: unknown[][] = [[], [{ curatedScore: null, summary: null }]];
    mockedSelect.mockImplementation(() => makeChain(() => results.shift() ?? []));

    const { body } = await readJson(await get({ companyId: TEST_COMPANY_ID }));

    // The feed's orphan path drops these for the same reason — no number to
    // show — so the detail page has to agree.
    expect(body.match).toBeNull();
  });

  it("drops the curated summary once the real score overtakes the floor", async () => {
    mockedSelect.mockImplementation(() =>
      makeChain(() => [
        {
          id: "match-1",
          overallScore: 95,
          capabilityScore: 90,
          experienceScore: 90,
          locationScore: 90,
          certificationScore: 95,
          matchReasons: ["real reason"],
          improvementSuggestions: [],
          aiAnalysis: { analysis: "real summary" },
          curation: {
            tenderId: TENDER_ID,
            curatedScore: 80,
            pinned: false,
            pinRank: null,
            capabilityScore: 60,
            experienceScore: 70,
            locationScore: 50,
            certificationScore: 85,
            matchReasons: ["curated reason"],
            summary: "curated summary",
          },
        },
      ]),
    );

    const { body } = await readJson(await get({ companyId: TEST_COMPANY_ID }));

    // Curation is a floor: at 95 the real numbers win. The narrative has to move
    // with them, or the page shows a summary written for 80% beside a 95% score
    // and the model's own reasons.
    expect(body.match).toMatchObject({
      overallScore: 95,
      capabilityScore: 90,
      matchReasons: ["real reason"],
      aiAnalysis: { analysis: "real summary" },
    });
  });

  it("reports the curated numbers, so it cannot contradict the card", async () => {
    mockedSelect.mockImplementation(() =>
      makeChain(() => [
        {
          id: "match-1",
          overallScore: 12,
          capabilityScore: 30,
          experienceScore: 20,
          locationScore: 40,
          certificationScore: 10,
          matchReasons: ["real reason"],
          improvementSuggestions: [],
          aiAnalysis: { analysis: "real summary" },
          curation: {
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
          },
        },
      ]),
    );

    const { status, body } = await readJson(
      await get({ companyId: TEST_COMPANY_ID }),
    );

    expect(status).toBe(200);
    // Clicking a 92% card through to a 12% detail page is the failure mode this
    // whole overlay exists to prevent.
    expect(body.match).toMatchObject({
      overallScore: 92,
      capabilityScore: 70,
      certificationScore: 100,
      matchReasons: ["curated reason"],
      aiAnalysis: { analysis: "curated summary" },
    });
    expect(body.match).not.toHaveProperty("curation");
  });

  it("leaves an uncurated match alone when the join misses", async () => {
    mockedSelect.mockImplementation(() =>
      makeChain(() => [
        {
          id: "match-1",
          overallScore: 55,
          capabilityScore: 60,
          experienceScore: 50,
          locationScore: 50,
          certificationScore: 55,
          matchReasons: ["real reason"],
          improvementSuggestions: [],
          aiAnalysis: { analysis: "real summary" },
          // A LEFT JOIN miss still materializes the nested object, all nulls.
          curation: {
            tenderId: null,
            curatedScore: null,
            pinned: null,
            pinRank: null,
            capabilityScore: null,
            experienceScore: null,
            locationScore: null,
            certificationScore: null,
            matchReasons: null,
            summary: null,
          },
        },
      ]),
    );

    const { body } = await readJson(await get({ companyId: TEST_COMPANY_ID }));

    expect(body.match).toMatchObject({
      overallScore: 55,
      capabilityScore: 60,
      matchReasons: ["real reason"],
      aiAnalysis: { analysis: "real summary" },
    });
  });
});
