import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { POST } from "@/app/api/company/approve-member/route";
import { AuthError, requireAuth } from "@/lib/api/validation";
import { updateCompanyJoinRequest } from "@/lib/db/queries";
import { sendEmail } from "@/lib/email";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  updateCompanyJoinRequest: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => {}),
  getCompanyAdminApprovalEmailSubject: vi.fn(() => "subject"),
  getCompanyAdminApprovalEmailHtml: vi.fn(() => "<p>html</p>"),
  getAdminNotificationEmailHtml: vi.fn(() => "<p>html</p>"),
}));

vi.mock("@/lib/email/i18n", () => ({
  getEmailLocale: vi.fn(async () => "en"),
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logApiEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
}));

const mockedSelect = db.select as unknown as Mock;
const user = mockUser();

const REQUEST_ID = "00000000-0000-4000-8000-0000000000f1";
const REQUESTER_ID = "00000000-0000-4000-8000-0000000000f2";

const joinRequest = {
  id: REQUEST_ID,
  userId: REQUESTER_ID,
  companyId: TEST_COMPANY_ID,
  companyNameRequested: "Existing Ltd",
  status: "pending",
};
const adminMembership = { role: "admin", status: "approved" };
const requesterProfile = {
  email: "requester@example.com",
  firstName: "Rita",
  lastName: "Requester",
};
const adminProfile = { firstName: "Ann", lastName: "Admin" };

function post(json: Record<string, unknown>) {
  return POST(
    makeRequest("/api/company/approve-member", { method: "POST", json }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user } as never);
  vi.mocked(updateCompanyJoinRequest).mockResolvedValue({
    id: REQUEST_ID,
  } as never);
});

describe("POST /api/company/approve-member", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new AuthError("Unauthorized"));
    const { status } = await readJson(
      await post({ requestId: REQUEST_ID, approved: true }),
    );
    expect(status).toBe(401);
  });

  it("returns 400 without a requestId", async () => {
    const { status, body } = await readJson(await post({ approved: true }));
    expect(status).toBe(400);
    expect(body.error).toBe("Request ID is required");
  });

  it("returns 404 for an unknown join request", async () => {
    queueSelects(mockedSelect, []);
    const { status } = await readJson(
      await post({ requestId: REQUEST_ID, approved: true }),
    );
    expect(status).toBe(404);
  });

  it("returns 403 when the caller is not an approved admin of the company", async () => {
    // Not a member at all.
    queueSelects(mockedSelect, [joinRequest], []);
    const nonMember = await readJson(
      await post({ requestId: REQUEST_ID, approved: true }),
    );
    expect(nonMember.status).toBe(403);

    // A plain (non-admin) member.
    queueSelects(mockedSelect, [joinRequest], [{ role: "member", status: "approved" }]);
    const plainMember = await readJson(
      await post({ requestId: REQUEST_ID, approved: true }),
    );
    expect(plainMember.status).toBe(403);

    // An admin whose own membership is still pending.
    queueSelects(mockedSelect, [joinRequest], [{ role: "admin", status: "pending" }]);
    const pendingAdmin = await readJson(
      await post({ requestId: REQUEST_ID, approved: true }),
    );
    expect(pendingAdmin.status).toBe(403);
    expect(updateCompanyJoinRequest).not.toHaveBeenCalled();
  });

  it("returns 400 when the request was already processed", async () => {
    queueSelects(
      mockedSelect,
      [{ ...joinRequest, status: "approved_by_admin" }],
      [adminMembership],
    );

    const { status, body } = await readJson(
      await post({ requestId: REQUEST_ID, approved: true }),
    );

    expect(status).toBe(400);
    expect(body.error).toContain("already approved_by_admin");
  });

  it("approves: moves the request to approved_by_admin and notifies the requester", async () => {
    queueSelects(
      mockedSelect,
      [joinRequest],
      [adminMembership],
      [requesterProfile],
      [adminProfile],
      [], // no superadmins
    );

    const { status, body } = await readJson(
      await post({ requestId: REQUEST_ID, approved: true }),
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      message: expect.stringContaining("Rita Requester"),
    });
    expect(updateCompanyJoinRequest).toHaveBeenCalledWith(REQUEST_ID, {
      status: "approved_by_admin",
      adminApprovedAt: expect.any(Date),
      adminApprovedBy: TEST_USER_ID,
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "requester@example.com" }),
    );
    expect(logApiEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionType: "company_member_approved" }),
    );
  });

  it("rejects: records the rejection with a default reason", async () => {
    queueSelects(
      mockedSelect,
      [joinRequest],
      [adminMembership],
      [requesterProfile],
      [adminProfile],
    );

    const { status, body } = await readJson(
      await post({ requestId: REQUEST_ID, approved: false }),
    );

    expect(status).toBe(200);
    expect(body.message).toContain("rejected");
    expect(updateCompanyJoinRequest).toHaveBeenCalledWith(REQUEST_ID, {
      status: "rejected",
      rejectionReason: "Rejected by company administrator",
      rejectedBy: TEST_USER_ID,
    });
  });
});
