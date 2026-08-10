import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { POST, PUT } from "@/app/api/auth/signup-invite/route";
import { getAuthenticatedUser } from "@/lib/api";
import { auth } from "@/lib/auth";
import {
  acceptTeamInvitation,
  createCompanyMember,
  createProfile,
  createUserRole,
  updateProfileByUserId,
} from "@/lib/db/queries";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { makeChain, queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { signUpEmail: vi.fn() } },
}));

vi.mock("@/lib/db/queries", () => ({
  createProfile: vi.fn(),
  createUserRole: vi.fn(),
  updateProfileByUserId: vi.fn(),
  createCompanyMember: vi.fn(),
  acceptTeamInvitation: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => {}),
  getAdminNotificationEmailSubject: vi.fn(() => "subject"),
  getAdminNotificationEmailHtml: vi.fn(() => "<p>html</p>"),
}));

vi.mock("@/lib/email/i18n", () => ({
  getEmailLocale: vi.fn(async () => "en"),
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logApiEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

const mockedSelect = db.select as unknown as Mock;
const mockedSignUp = vi.mocked(auth.api.signUpEmail);

const VALID_TOKEN = "b".repeat(64);
const NEW_USER_ID = "00000000-0000-4000-8000-0000000000b1";

const invitation = {
  id: "inv-1",
  email: "invited@example.com",
  companyId: TEST_COMPANY_ID,
  invitedBy: "admin-1",
  status: "pending",
  expiresAt: new Date(Date.now() + 86_400_000),
};
const companyRow = { id: TEST_COMPANY_ID, companyName: "Team Ltd" };

beforeEach(() => {
  vi.clearAllMocks();
  mockedSignUp.mockResolvedValue({ user: { id: NEW_USER_ID } } as never);
});

describe("POST /api/auth/signup-invite (new user)", () => {
  function post(json: Record<string, unknown>) {
    return POST(makeRequest("/api/auth/signup-invite", { method: "POST", json }));
  }

  it("validates token and password up front", async () => {
    expect((await readJson(await post({ token: VALID_TOKEN }))).status).toBe(400);
    expect(
      (await readJson(await post({ token: "garbage", password: "secret1" })))
        .status,
    ).toBe(400);
    expect(
      (await readJson(await post({ token: VALID_TOKEN, password: "short" })))
        .status,
    ).toBe(400);
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("rejects an unknown, used, or expired invitation", async () => {
    queueSelects(mockedSelect, []);
    const unknown = await readJson(
      await post({ token: VALID_TOKEN, password: "secret1" }),
    );
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toBe("Invalid invitation link");

    queueSelects(mockedSelect, [{ ...invitation, status: "accepted" }]);
    const used = await readJson(
      await post({ token: VALID_TOKEN, password: "secret1" }),
    );
    expect(used.status).toBe(400);

    queueSelects(mockedSelect, [
      { ...invitation, expiresAt: new Date(Date.now() - 1000) },
    ]);
    const updateChain = makeChain(() => undefined);
    (db.update as unknown as Mock).mockImplementation(() => updateChain);
    const expired = await readJson(
      await post({ token: VALID_TOKEN, password: "secret1" }),
    );
    expect(expired.status).toBe(400);
    expect(expired.body.error).toBe("This invitation has expired");
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "expired" }),
    );
  });

  it("rejects when the invited email already has an account", async () => {
    queueSelects(
      mockedSelect,
      [invitation],
      [{ userId: "existing-user" }], // profile with this email exists
    );

    const { status, body } = await readJson(
      await post({ token: VALID_TOKEN, password: "secret1" }),
    );

    expect(status).toBe(400);
    expect(body.error).toContain("already exists");
    expect(mockedSignUp).not.toHaveBeenCalled();
  });

  it("creates the user, profile, role, pending membership, and consumes the invitation", async () => {
    queueSelects(
      mockedSelect,
      [invitation],
      [], // email not registered
      [companyRow],
      [], // no superadmins to notify
    );

    const { status, body } = await readJson(
      await post({ token: VALID_TOKEN, password: "secret123" }),
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, requiresApproval: true });

    expect(mockedSignUp).toHaveBeenCalledWith({
      body: {
        email: "invited@example.com",
        password: "secret123",
        name: "invited",
      },
    });
    expect(createProfile).toHaveBeenCalledWith(NEW_USER_ID, "invited@example.com");
    expect(updateProfileByUserId).toHaveBeenCalledWith(NEW_USER_ID, {
      signupType: "invited",
      invitedToCompanyId: TEST_COMPANY_ID,
      onboardingStep: 2,
    });
    expect(createUserRole).toHaveBeenCalledWith(NEW_USER_ID, "sme-member");
    expect(createCompanyMember).toHaveBeenCalledWith({
      companyId: TEST_COMPANY_ID,
      userId: NEW_USER_ID,
      role: "member",
      status: "pending",
      invitedBy: "admin-1",
    });
    expect(acceptTeamInvitation).toHaveBeenCalledWith("inv-1", NEW_USER_ID);
  });
});

describe("PUT /api/auth/signup-invite (existing user accepts)", () => {
  const user = mockUser({ email: "invited@example.com" });

  function put(json: Record<string, unknown>) {
    return PUT(makeRequest("/api/auth/signup-invite", { method: "PUT", json }));
  }

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ user, error: null });
  });

  it("returns 401 when not logged in", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      error: "Unauthorized",
    });
    const { status } = await readJson(await put({ token: VALID_TOKEN }));
    expect(status).toBe(401);
  });

  it("returns 403 when the invitation was sent to a different email", async () => {
    queueSelects(
      mockedSelect,
      [invitation],
      [{ email: "someone-else@example.com" }],
    );

    const { status, body } = await readJson(await put({ token: VALID_TOKEN }));

    expect(status).toBe(403);
    expect(body.error).toContain("different email");
    expect(createCompanyMember).not.toHaveBeenCalled();
  });

  it("rejects when already an approved member", async () => {
    queueSelects(
      mockedSelect,
      [invitation],
      [{ email: "INVITED@example.com" }], // case-insensitive match
      [companyRow],
      [{ id: "m-1", status: "approved" }],
    );

    const { status, body } = await readJson(await put({ token: VALID_TOKEN }));

    expect(status).toBe(400);
    expect(body.error).toBe("You are already a member of this company");
  });

  it("creates a pending membership and consumes the invitation", async () => {
    queueSelects(
      mockedSelect,
      [invitation],
      [{ email: "invited@example.com" }],
      [companyRow],
      [], // not yet a member
      [{ firstName: "Ivy", lastName: "Invitee", jobTitle: null }],
      [], // no superadmins
    );

    const { status, body } = await readJson(await put({ token: VALID_TOKEN }));

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, requiresApproval: true });
    expect(createCompanyMember).toHaveBeenCalledWith({
      companyId: TEST_COMPANY_ID,
      userId: TEST_USER_ID,
      role: "member",
      status: "pending",
      invitedBy: "admin-1",
    });
    expect(updateProfileByUserId).toHaveBeenCalledWith(TEST_USER_ID, {
      invitedToCompanyId: TEST_COMPANY_ID,
      signupType: "invited",
      onboardingStep: 4,
      onboardingCompletedAt: null,
    });
    expect(acceptTeamInvitation).toHaveBeenCalledWith("inv-1", TEST_USER_ID);
  });
});
