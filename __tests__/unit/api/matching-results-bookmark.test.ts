import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PUT } from "@/app/api/matching-results/[resultId]/bookmark/route";
import { AuthError, isCompanyMember, requireAuth } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { db } from "@/lib/db";
import { makeRequest, readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser } from "@/__tests__/helpers/mocks";
import { makeChain } from "@/__tests__/helpers/drizzleMock";

// The route now gates via `getCompanyAccess`, which falls through to the
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
  db: { select: vi.fn(), update: vi.fn() },
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedIsCompanyMember = isCompanyMember as unknown as Mock;
const mockedCheckSuperadminRole = checkSuperadminRole as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;
const mockedUpdate = db.update as unknown as Mock;

const RESULT_ID = "00000000-0000-4000-8000-0000000000aa";
const COMPANY_ID = "00000000-0000-4000-8000-0000000000cc";
const user = mockUser();

function queueLookup(rows: unknown[]) {
  mockedSelect.mockImplementationOnce(() => makeChain(() => rows));
}

function put(json: Record<string, unknown>) {
  return PUT(
    makeRequest(`/api/matching-results/${RESULT_ID}/bookmark`, {
      method: "PUT",
      json,
    }),
    routeParams({ resultId: RESULT_ID }),
  );
}

describe("PUT /api/matching-results/[resultId]/bookmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireAuth.mockResolvedValue({ user });
    mockedIsCompanyMember.mockResolvedValue(true);
    mockedCheckSuperadminRole.mockResolvedValue(false);
  });

  it("returns 401 when unauthenticated", async () => {
    mockedRequireAuth.mockRejectedValue(new AuthError("Unauthorized"));

    const { status, body } = await readJson(await put({ isBookmarked: true }));

    expect(status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when the matching result does not exist", async () => {
    queueLookup([]);

    const { status, body } = await readJson(await put({ isBookmarked: true }));

    expect(status).toBe(404);
    expect(body.error).toBe("Result not found");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 when the user is neither owner nor approved member", async () => {
    queueLookup([{ id: RESULT_ID, companyId: COMPANY_ID }]);
    mockedIsCompanyMember.mockResolvedValue(false);

    const { status, body } = await readJson(await put({ isBookmarked: true }));

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this matching result");
    expect(mockedIsCompanyMember).toHaveBeenCalledWith(user.id, COMPANY_ID);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("allows a superadmin non-member preparing the account", async () => {
    queueLookup([{ id: RESULT_ID, companyId: COMPANY_ID }]);
    mockedIsCompanyMember.mockResolvedValue(false);
    mockedCheckSuperadminRole.mockResolvedValue(true);
    const updateChain = makeChain(() => [{ id: RESULT_ID, isBookmarked: true }]);
    mockedUpdate.mockImplementation(() => updateChain);

    const { status } = await readJson(await put({ isBookmarked: true }));

    expect(status).toBe(200);
    expect(mockedUpdate).toHaveBeenCalled();
  });

  it("allows an approved team member (not just the owner) to bookmark", async () => {
    // Access goes through isCompanyMember(), which covers both the company
    // owner and approved company_members rows — same as the other routes.
    queueLookup([{ id: RESULT_ID, companyId: COMPANY_ID }]);
    mockedIsCompanyMember.mockResolvedValue(true);
    const updateChain = makeChain(() => [{ id: RESULT_ID, isBookmarked: true }]);
    mockedUpdate.mockImplementation(() => updateChain);

    const { status, body } = await readJson(await put({ isBookmarked: true }));

    expect(status).toBe(200);
    expect(body.result).toEqual({ id: RESULT_ID, isBookmarked: true });
    expect(mockedIsCompanyMember).toHaveBeenCalledWith(user.id, COMPANY_ID);
  });

  it("updates the bookmark with the camelCase isBookmarked key", async () => {
    queueLookup([{ id: RESULT_ID, companyId: COMPANY_ID }]);
    const updateChain = makeChain(() => [{ id: RESULT_ID, isBookmarked: true }]);
    mockedUpdate.mockImplementation(() => updateChain);

    const { status, body } = await readJson(await put({ isBookmarked: true }));

    expect(status).toBe(200);
    expect(body.result).toEqual({ id: RESULT_ID, isBookmarked: true });
    expect(updateChain.set).toHaveBeenCalledWith({ isBookmarked: true });
    expect(updateChain.where).toHaveBeenCalledTimes(1);
  });

  it("accepts the snake_case is_bookmarked key", async () => {
    queueLookup([{ id: RESULT_ID, companyId: COMPANY_ID }]);
    const updateChain = makeChain(() => [{ id: RESULT_ID, isBookmarked: false }]);
    mockedUpdate.mockImplementation(() => updateChain);

    const { status, body } = await readJson(await put({ is_bookmarked: false }));

    expect(status).toBe(200);
    expect(body.result).toEqual({ id: RESULT_ID, isBookmarked: false });
    expect(updateChain.set).toHaveBeenCalledWith({ isBookmarked: false });
  });
});
