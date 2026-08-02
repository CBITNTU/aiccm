import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { GET as getAvailable } from "@/app/api/tenders/available/route";
import { GET as getMatches } from "@/app/api/tenders/matches/route";
import {
  AuthError,
  isCompanyMember,
  requireAuth,
} from "@/lib/api/validation";
import { basicMatchTendersForCompany } from "@/lib/services/basicMatchingService";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID } from "@/__tests__/helpers/mocks";
import { queueSelects, type Chain } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
  isCompanyMember: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
}));

vi.mock("@/lib/services/basicMatchingService", () => ({
  basicMatchTendersForCompany: vi.fn(),
}));

const mockedSelect = db.select as unknown as Mock;
const mockedBasicMatch = vi.mocked(basicMatchTendersForCompany);
const dialect = new PgDialect();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: mockUser() } as never);
  vi.mocked(isCompanyMember).mockResolvedValue(true);
  mockedBasicMatch.mockResolvedValue([]);
});

describe("GET /api/tenders/available", () => {
  function get(searchParams: Record<string, string> = {}) {
    return getAvailable(makeRequest("/api/tenders/available", { searchParams }));
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new AuthError("Unauthorized"));
    const { status } = await readJson(await get());
    expect(status).toBe(401);
  });

  it("returns only open/closing_soon tenders, capped at 100", async () => {
    const rows = [{ id: "t1", title: "A" }];
    const chains = queueSelects(mockedSelect, rows);

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body.tenders).toEqual(rows);

    const chain: Chain = chains[0];
    expect(chain.limit).toHaveBeenCalledWith(100);
    const where = dialect.sqlToQuery(chain.where.mock.calls[0][0] as SQL);
    expect(where.params).toEqual(expect.arrayContaining(["open", "closing_soon"]));
  });

  it("escapes LIKE wildcards in the search term", async () => {
    const chains = queueSelects(mockedSelect, []);

    await readJson(await get({ search: "50% roofing" }));

    const where = dialect.sqlToQuery(chains[0].where.mock.calls[0][0] as SQL);
    // The literal % is escaped; the surrounding wildcards remain.
    expect(where.params).toEqual(
      expect.arrayContaining(["%50\\% roofing%"]),
    );
  });
});

describe("GET /api/tenders/matches", () => {
  const deepRow = {
    match: {
      id: "mr-1",
      tenderId: "t-deep",
      companyId: TEST_COMPANY_ID,
      overallScore: 80,
      capabilityScore: 70,
      experienceScore: 60,
      locationScore: 50,
      certificationScore: 40,
      matchReasons: ["good fit"],
      isBookmarked: false,
      isApplied: false,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    },
    tender: {
      title: "Deep tender",
      buyer: "Council A",
      description: "d",
      location: "Leeds",
      deadline: null,
      budgetMin: null,
      budgetMax: null,
      currency: "GBP",
      status: "open",
    },
  };

  function get(searchParams: Record<string, string> = {}) {
    return getMatches(
      makeRequest("/api/tenders/matches", {
        searchParams: { companyId: TEST_COMPANY_ID, ...searchParams },
      }),
    );
  }

  it("returns 400 without a companyId", async () => {
    const { status, body } = await readJson(
      await getMatches(makeRequest("/api/tenders/matches")),
    );
    expect(status).toBe(400);
    expect(body.error).toBe("companyId is required");
  });

  it("returns 401 for a non-member", async () => {
    vi.mocked(isCompanyMember).mockResolvedValue(false);

    const { status, body } = await readJson(await get());

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("merges deep results with the basic overlay, deep wins on overlap", async () => {
    // Await order: deepCount, deepResearched, ruledOut, deepWindow, then the
    // dedup query for basic ids, then hydration for surviving basic ids.
    queueSelects(
      mockedSelect,
      [{ count: 1 }], // deepMatchedCount
      [{ count: 1 }], // deepResearchedCount
      [{ count: 0 }], // ruledOutCount
      [deepRow], // deep window
      [{ tenderId: "t-deep" }], // dedup: t-deep already has a deep row
      [{ id: "t-basic", description: "hydrated", budgetMin: null, budgetMax: null, currency: "GBP" }],
    );
    mockedBasicMatch.mockResolvedValue([
      {
        tenderId: "t-deep", // duplicate of the deep row — must be dropped
        title: "Deep tender",
        buyer: "Council A",
        cpvCodes: null,
        location: "Leeds",
        deadline: null,
        status: "open",
        similarity: 0.95,
        band: "high",
      },
      {
        tenderId: "t-basic",
        title: "Basic tender",
        buyer: "Council B",
        cpvCodes: null,
        location: "York",
        deadline: null,
        status: "open",
        similarity: 0.9,
        band: "high",
      },
    ]);

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    const results = body.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    // Basic scores 90, deep scores 80 → basic first for desc overall_score.
    expect(results[0]).toMatchObject({
      variant: "basic",
      tenderId: "t-basic",
      score: 90,
      description: "hydrated",
    });
    expect(results[1]).toMatchObject({
      variant: "deep",
      tenderId: "t-deep",
      score: 80,
    });
    expect(body).toMatchObject({
      matchedCount: 2, // 1 deep + 1 surviving basic
      deepResearchedCount: 1,
      ruledOutCount: 0,
      page: 1,
      pageSize: 25,
    });
  });

  it("skips the basic overlay entirely in the ruled_out view", async () => {
    queueSelects(
      mockedSelect,
      [{ count: 1 }],
      [{ count: 3 }],
      [{ count: 1 }],
      [
        {
          ...deepRow,
          match: { ...deepRow.match, overallScore: 0 },
        },
      ],
    );

    const { status, body } = await readJson(await get({ view: "ruled_out" }));

    expect(status).toBe(200);
    expect(mockedBasicMatch).not.toHaveBeenCalled();
    const results = body.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ variant: "deep", score: 0 });
    expect(body).toMatchObject({ ruledOutCount: 1, deepResearchedCount: 3 });
  });
});
