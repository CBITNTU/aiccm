import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { DELETE } from "@/app/api/companies/[companyId]/pending-changes/route";
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

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedIsCompanyMember = isCompanyMember as unknown as Mock;
const mockedCheckSuperadminRole = checkSuperadminRole as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;
const mockedUpdate = db.update as unknown as Mock;

/** Queue the "is a change_review pending?" lookup. */
function queuePendingReview(rows: unknown[]) {
  mockedSelect.mockImplementationOnce(() => makeChain(() => rows));
}

function del() {
  return DELETE(
    makeRequest(`/api/companies/${TEST_COMPANY_ID}/pending-changes`, {
      method: "DELETE",
    }),
    routeParams({ companyId: TEST_COMPANY_ID }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireAuth.mockResolvedValue({ user: mockUser() });
  mockedIsCompanyMember.mockResolvedValue(true);
  mockedCheckSuperadminRole.mockResolvedValue(false);
  mockedUpdate.mockImplementation(() => makeChain(() => undefined));
});

describe("DELETE /api/companies/[companyId]/pending-changes", () => {
  it("returns 401 for a non-member who is not a superadmin", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);

    const { status, body } = await readJson(await del());

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("discards the draft for an ordinary member", async () => {
    queuePendingReview([]);

    const { status, body } = await readJson(await del());

    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockedUpdate).toHaveBeenCalled();
  });

  it("lets a superadmin non-member clear an owner's stale draft", async () => {
    // Under adminOverride the company PUT writes straight to the columns, so a
    // leftover owner draft would otherwise keep painting "Draft" badges and
    // could later be submitted carrying outdated proposed values.
    mockedIsCompanyMember.mockResolvedValue(false);
    mockedCheckSuperadminRole.mockResolvedValue(true);
    queuePendingReview([]);

    const { status, body } = await readJson(await del());

    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockedUpdate).toHaveBeenCalled();
  });

  it("does not let a superadmin discard while a review is pending", async () => {
    // The review lock is deliberately NOT bypassed for adminOverride —
    // discarding under a submitted review would strand the request.
    mockedIsCompanyMember.mockResolvedValue(false);
    mockedCheckSuperadminRole.mockResolvedValue(true);
    queuePendingReview([{ id: "req-1" }]);

    const { status, body } = await readJson(await del());

    expect(status).toBe(400);
    expect(body.error).toContain("Cannot discard changes while a review is pending");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
