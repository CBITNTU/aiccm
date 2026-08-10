import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET } from "@/app/api/matching-results/route";
import { DELETE } from "@/app/api/matching-results/[resultId]/route";
import {
  AuthError,
  isCompanyMember,
  requireAuth,
} from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { db } from "@/lib/db";
import { makeRequest, readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { makeChain, queueSelects, type Chain } from "@/__tests__/helpers/drizzleMock";

// Both routes now gate via `getCompanyAccess`, which falls through to the
// superadmin role when membership fails — stub it so the deny path doesn't
// reach the real `userHasRole` query.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkSuperadminRole: vi.fn(),
}));

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
  isCompanyMember: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), delete: vi.fn(), update: vi.fn() },
}));

// Mocked at the seam so these tests stay indifferent to how many queries the
// curated overlay runs. The SQL helpers stay real — the where-clause assertions
// below depend on the effective-score expression they build.
vi.mock("@/lib/services/curatedMatches", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/curatedMatches")>()),
  getCurationOverlay: vi.fn(async () => new Map()),
}));

const mockedSelect = db.select as unknown as Mock;
const mockedDelete = db.delete as unknown as Mock;
const mockedUpdate = db.update as unknown as Mock;
const user = mockUser();

const RESULT_ID = "00000000-0000-4000-8000-0000000000aa";

const matchRow = {
  match: {
    id: RESULT_ID,
    companyId: TEST_COMPANY_ID,
    tenderId: "t1",
    overallScore: 82,
    isBookmarked: false,
  },
  tender: {
    title: "School refurbishment",
    buyer: "Leeds Council",
    description: "Roof works",
    location: "Leeds",
    deadline: null,
    budgetMin: 100000,
    budgetMax: 500000,
    currency: "GBP",
    status: "open",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user } as never);
  vi.mocked(isCompanyMember).mockResolvedValue(true);
  vi.mocked(checkSuperadminRole).mockResolvedValue(false);
});

describe("GET /api/matching-results", () => {
  function get(searchParams: Record<string, string> = {}) {
    return GET(makeRequest("/api/matching-results", { searchParams }));
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new AuthError("Unauthorized"));
    const { status } = await readJson(await get());
    expect(status).toBe(401);
  });

  it("returns 401 when requesting another company's results", async () => {
    vi.mocked(isCompanyMember).mockResolvedValue(false);

    const { status, body } = await readJson(
      await get({ companyId: TEST_COMPANY_ID }),
    );

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
    expect(vi.mocked(isCompanyMember)).toHaveBeenCalledWith(
      TEST_USER_ID,
      TEST_COMPANY_ID,
    );
  });

  it("lets a superadmin read a company they are not a member of", async () => {
    vi.mocked(isCompanyMember).mockResolvedValue(false);
    vi.mocked(checkSuperadminRole).mockResolvedValue(true);
    queueSelects(mockedSelect, [{ count: 0 }], []);

    const { status } = await readJson(
      await get({ companyId: TEST_COMPANY_ID }),
    );

    expect(status).toBe(200);
  });

  it("returns joined results in the legacy shape with a total count", async () => {
    // Results are consumed in await order: Promise.all subscribes the count
    // query first, then the data query (even though the data chain is built first).
    queueSelects(mockedSelect, [{ count: 12 }], [matchRow]);

    const { status, body } = await readJson(
      await get({ companyId: TEST_COMPANY_ID }),
    );

    expect(status).toBe(200);
    expect(body.totalCount).toBe(12);
    const results = body.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: RESULT_ID,
      companyId: TEST_COMPANY_ID,
      overallScore: 82,
      tenders: { title: "School refurbishment", buyer: "Leeds Council" },
    });
  });

  it("clamps pagination and applies limit/offset", async () => {
    const chains = queueSelects(mockedSelect, [{ count: 0 }], []);

    await readJson(
      await get({ companyId: TEST_COMPANY_ID, page: "3", pageSize: "500" }),
    );

    // chains is in creation order: the data query chain is built first.
    const dataChain: Chain = chains[0];
    expect(dataChain.limit).toHaveBeenCalledWith(100); // pageSize capped at 100
    expect(dataChain.offset).toHaveBeenCalledWith(200); // (3-1) × 100
  });

  it("defaults totalCount to 0 when the count query returns nothing", async () => {
    queueSelects(mockedSelect, [], []);

    const { body } = await readJson(await get({ companyId: TEST_COMPANY_ID }));
    expect(body).toEqual({ results: [], totalCount: 0 });
  });

  it("rejects a request with no companyId instead of returning every company", async () => {
    // Without the param the where-clause carried no company predicate at all,
    // so any authenticated caller could page through the whole table.
    const { status, body } = await readJson(await get());

    expect(status).toBe(400);
    expect(body.error).toBe("companyId is required");
    expect(mockedSelect).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/matching-results/[resultId]", () => {
  function del() {
    return DELETE(
      makeRequest(`/api/matching-results/${RESULT_ID}`, { method: "DELETE" }),
      routeParams({ resultId: RESULT_ID }),
    );
  }

  it("returns 401 for an unknown result (no existence leak)", async () => {
    queueSelects(mockedSelect, []);

    const { status, body } = await readJson(await del());

    expect(status).toBe(401);
    expect(body.error).toBe("Matching result not found");
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("returns 401 when the user has no access to the result's company", async () => {
    queueSelects(mockedSelect, [{ companyId: TEST_COMPANY_ID }]);
    vi.mocked(isCompanyMember).mockResolvedValue(false);

    const { status, body } = await readJson(await del());

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this matching result");
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("lets a superadmin non-member delete while preparing the account", async () => {
    queueSelects(mockedSelect, [{ companyId: TEST_COMPANY_ID }]);
    vi.mocked(isCompanyMember).mockResolvedValue(false);
    vi.mocked(checkSuperadminRole).mockResolvedValue(true);
    const deleteChain = makeChain(() => undefined);
    mockedDelete.mockImplementation(() => deleteChain);
    mockedUpdate.mockImplementation(() => makeChain(() => []));

    const { status, body } = await readJson(await del());

    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockedDelete).toHaveBeenCalled();
  });

  it("deletes the result for an authorized member", async () => {
    queueSelects(mockedSelect, [{ companyId: TEST_COMPANY_ID }]);
    const deleteChain = makeChain(() => undefined);
    mockedDelete.mockImplementation(() => deleteChain);
    mockedUpdate.mockImplementation(() => makeChain(() => []));

    const { status, body } = await readJson(await del());

    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockedDelete).toHaveBeenCalledTimes(1);
    expect(deleteChain.where).toHaveBeenCalledTimes(1);
  });

  it("archives any curation so a dismissed match cannot come back", async () => {
    queueSelects(mockedSelect, [
      { companyId: TEST_COMPANY_ID, tenderId: "t1" },
    ]);
    mockedDelete.mockImplementation(() => makeChain(() => undefined));
    const updateChain = makeChain(() => [{ id: "c1", status: "archived" }]);
    mockedUpdate.mockImplementation(() => updateChain);

    const { status } = await readJson(await del());

    expect(status).toBe(200);
    // Without this the curated tender re-renders on the next load as a
    // synthesized card, and a "deleted" result reappearing is the loudest
    // possible sign that something is overriding the feed.
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" }),
    );
  });
});
