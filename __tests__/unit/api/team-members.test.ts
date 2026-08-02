import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { DELETE } from "@/app/api/team/members/route";
import { getAuthenticatedUser } from "@/lib/api";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { makeChain, queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logApiEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

const mockedSelect = db.select as unknown as Mock;
const mockedUpdate = db.update as unknown as Mock;
const mockedDelete = db.delete as unknown as Mock;

const user = mockUser();
const MEMBER_ID = "00000000-0000-4000-8000-0000000000d1";
const OTHER_USER_ID = "00000000-0000-4000-8000-0000000000d2";

const smeOwnerRole = [{ role: "sme-owner" }];
const adminMembership = [{ role: "admin", status: "approved" }];

function del(json: Record<string, unknown> = { memberId: MEMBER_ID, companyId: TEST_COMPANY_ID }) {
  return DELETE(makeRequest("/api/team/members", { method: "DELETE", json }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ user, error: null });
});

describe("DELETE /api/team/members", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      error: "Unauthorized",
    });
    const { status } = await readJson(await del());
    expect(status).toBe(401);
  });

  it("requires memberId and companyId", async () => {
    const { status } = await readJson(await del({ memberId: MEMBER_ID }));
    expect(status).toBe(400);
  });

  it("returns 403 when the caller is not an sme-owner", async () => {
    queueSelects(mockedSelect, []); // no sme-owner role
    const { status, body } = await readJson(await del());
    expect(status).toBe(403);
    expect(body.error).toBe("Only SME owners can remove team members");
  });

  it("returns 403 when the caller is not an approved company admin", async () => {
    queueSelects(mockedSelect, smeOwnerRole, [
      { role: "member", status: "approved" },
    ]);
    const { status } = await readJson(await del());
    expect(status).toBe(403);
  });

  it("returns 404 for an unknown member", async () => {
    queueSelects(mockedSelect, smeOwnerRole, adminMembership, []);
    const { status } = await readJson(await del());
    expect(status).toBe(404);
  });

  it("refuses to remove yourself", async () => {
    queueSelects(mockedSelect, smeOwnerRole, adminMembership, [
      { id: MEMBER_ID, userId: TEST_USER_ID, role: "member", status: "approved" },
    ]);

    const { status, body } = await readJson(await del());

    expect(status).toBe(400);
    expect(body.error).toBe("You cannot remove yourself from the company");
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("refuses to remove the only admin", async () => {
    queueSelects(
      mockedSelect,
      smeOwnerRole,
      adminMembership,
      [{ id: MEMBER_ID, userId: OTHER_USER_ID, role: "admin", status: "approved" }],
      [{ count: 1 }],
    );

    const { status, body } = await readJson(await del());

    expect(status).toBe(400);
    expect(body.error).toContain("only admin");
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("removes a member and clears their invited_to_company_id", async () => {
    queueSelects(mockedSelect, smeOwnerRole, adminMembership, [
      { id: MEMBER_ID, userId: OTHER_USER_ID, role: "member", status: "approved" },
    ]);
    const deleteChain = makeChain(() => undefined);
    const updateChain = makeChain(() => undefined);
    mockedDelete.mockImplementation(() => deleteChain);
    mockedUpdate.mockImplementation(() => updateChain);

    const { status, body } = await readJson(await del());

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, message: "Member removed successfully" });
    expect(mockedDelete).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith({ invitedToCompanyId: null });
  });

  it("removes an admin when another approved admin remains", async () => {
    queueSelects(
      mockedSelect,
      smeOwnerRole,
      adminMembership,
      [{ id: MEMBER_ID, userId: OTHER_USER_ID, role: "admin", status: "approved" }],
      [{ count: 2 }],
    );
    mockedDelete.mockImplementation(() => makeChain(() => undefined));
    mockedUpdate.mockImplementation(() => makeChain(() => undefined));

    const { status } = await readJson(await del());
    expect(status).toBe(200);
  });
});
