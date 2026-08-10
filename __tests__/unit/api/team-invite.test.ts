import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { DELETE, POST as createInvite } from "@/app/api/team/invite/route";
import { POST as validateInvite } from "@/app/api/team/invite/validate/route";
import { getAuthenticatedUser } from "@/lib/api";
import { createTeamInvitation } from "@/lib/db/queries";
import { hashToken } from "@/lib/utils/invite-token";
import {
  getTeamInvitationEmailSubject,
  sendEmail,
} from "@/lib/email";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID } from "@/__tests__/helpers/mocks";
import { makeChain, queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  createTeamInvitation: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => {}),
  getTeamInvitationEmailSubject: vi.fn(() => "subject"),
  getTeamInvitationEmailHtml: vi.fn(() => "<p>html</p>"),
  getPlatformUrl: vi.fn((path: string) => `http://localhost:3000${path}`),
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
const mockedUpdate = db.update as unknown as Mock;
const user = mockUser();

const adminMembership = { role: "admin", status: "approved" };
const companyRow = { id: TEST_COMPANY_ID, companyName: "Team Ltd" };
const inviterProfile = {
  email: "admin@example.com",
  firstName: "Ann",
  lastName: "Admin",
};

const VALID_TOKEN = "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ user, error: null });
  vi.mocked(createTeamInvitation).mockResolvedValue({ id: "inv-1" } as never);
});

describe("POST /api/team/invite", () => {
  function post(json: Record<string, unknown>) {
    return createInvite(makeRequest("/api/team/invite", { method: "POST", json }));
  }
  // Note: the route validates the email format BEFORE trimming/normalizing,
  // so the fixture must not carry surrounding whitespace.
  const BODY = { companyId: TEST_COMPANY_ID, email: "New.Member@Example.com" };

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      error: "Unauthorized",
    });
    const { status } = await readJson(await post(BODY));
    expect(status).toBe(401);
  });

  it("validates required fields and email format", async () => {
    expect((await readJson(await post({ email: "a@b.co" }))).status).toBe(400);
    expect(
      (await readJson(await post({ companyId: TEST_COMPANY_ID, email: "nope" })))
        .status,
    ).toBe(400);
  });

  it("returns 403 when the caller is not an approved company admin", async () => {
    queueSelects(mockedSelect, [{ role: "member", status: "approved" }]);
    const { status, body } = await readJson(await post(BODY));
    expect(status).toBe(403);
    expect(body.error).toBe("You are not an admin of this company");
  });

  it("rejects inviting yourself", async () => {
    queueSelects(
      mockedSelect,
      [adminMembership],
      [companyRow],
      [{ ...inviterProfile, email: "new.member@example.com" }],
    );
    const { status, body } = await readJson(await post(BODY));
    expect(status).toBe(400);
    expect(body.error).toBe("You cannot invite yourself");
  });

  it("rejects an email that is already an approved member", async () => {
    queueSelects(
      mockedSelect,
      [adminMembership],
      [companyRow],
      [inviterProfile],
      [{ userId: "existing-user", email: "new.member@example.com" }],
      [{ id: "m-1", status: "approved" }],
    );
    const { status, body } = await readJson(await post(BODY));
    expect(status).toBe(400);
    expect(body.error).toContain("already a member");
  });

  it("rejects when a live pending invitation already exists", async () => {
    queueSelects(
      mockedSelect,
      [adminMembership],
      [companyRow],
      [inviterProfile],
      [], // email not registered
      [
        {
          id: "inv-0",
          status: "pending",
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      ],
    );
    const { status, body } = await readJson(await post(BODY));
    expect(status).toBe(400);
    expect(body.error).toContain("already been sent");
    expect(createTeamInvitation).not.toHaveBeenCalled();
  });

  it("stores only the token hash and emails the raw token link", async () => {
    queueSelects(
      mockedSelect,
      [adminMembership],
      [companyRow],
      [inviterProfile],
      [], // email not registered
      [], // no existing invitation
    );

    const { status, body } = await readJson(await post(BODY));

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, invitationId: "inv-1" });

    const insert = vi.mocked(createTeamInvitation).mock.calls[0][0];
    expect(insert).toMatchObject({
      companyId: TEST_COMPANY_ID,
      email: "new.member@example.com", // normalized
      status: "pending",
    });
    // The stored value is a SHA-256 hash, never the raw token…
    expect(insert.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    // …and the emailed link carries the raw token that hashes to it.
    const emailData = vi.mocked(getTeamInvitationEmailSubject).mock
      .calls[0][0] as { inviteLink: string };
    const rawToken = new URL(emailData.inviteLink).searchParams.get("token")!;
    expect(rawToken).not.toBe(insert.tokenHash);
    expect(hashToken(rawToken)).toBe(insert.tokenHash);

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "new.member@example.com" }),
    );
  });
});

describe("POST /api/team/invite/validate", () => {
  function validate(token: unknown) {
    return validateInvite(
      makeRequest("/api/team/invite/validate", {
        method: "POST",
        json: { token },
      }),
    );
  }

  const invitation = {
    id: "inv-1",
    email: "invited@example.com",
    companyId: TEST_COMPANY_ID,
    invitedBy: "admin-1",
    status: "pending",
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  it("rejects a missing or malformed token without touching the DB", async () => {
    const missing = await readJson(await validate(""));
    expect(missing.body).toMatchObject({ valid: false });

    const garbage = await readJson(await validate("not-a-hex-token"));
    expect(garbage.body).toMatchObject({
      valid: false,
      error: "Invalid invitation link",
    });
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("reports an unknown token as invalid", async () => {
    queueSelects(mockedSelect, []);
    const { body } = await readJson(await validate(VALID_TOKEN));
    expect(body).toMatchObject({ valid: false, error: "Invalid invitation link" });
  });

  it("reports a consumed invitation with a specific message", async () => {
    queueSelects(mockedSelect, [{ ...invitation, status: "accepted" }]);
    const { body } = await readJson(await validate(VALID_TOKEN));
    expect(body.error).toBe("This invitation has already been used");
  });

  it("marks an expired invitation as expired in the DB", async () => {
    queueSelects(mockedSelect, [
      { ...invitation, expiresAt: new Date(Date.now() - 1000) },
    ]);
    const updateChain = makeChain(() => undefined);
    mockedUpdate.mockImplementation(() => updateChain);

    const { body } = await readJson(await validate(VALID_TOKEN));

    expect(body.valid).toBe(false);
    expect(body.error).toContain("expired");
    expect(updateChain.set).toHaveBeenCalledWith({ status: "expired" });
  });

  it("returns the full invitation context for a valid token", async () => {
    queueSelects(
      mockedSelect,
      [invitation],
      [companyRow],
      [{ firstName: "Ann", lastName: "Admin" }],
      [{ userId: "existing-user" }], // the invitee already has an account
    );

    const { body } = await readJson(await validate(VALID_TOKEN));

    expect(body).toMatchObject({
      valid: true,
      email: "invited@example.com",
      companyName: "Team Ltd",
      companyId: TEST_COMPANY_ID,
      inviterName: "Ann Admin",
      isExistingUser: true,
    });
  });
});

describe("DELETE /api/team/invite", () => {
  function del(json: Record<string, unknown>) {
    return DELETE(makeRequest("/api/team/invite", { method: "DELETE", json }));
  }

  it("cancels a pending invitation for a company admin", async () => {
    queueSelects(
      mockedSelect,
      [{ id: "inv-1", companyId: TEST_COMPANY_ID, status: "pending" }],
      [adminMembership],
    );
    const updateChain = makeChain(() => undefined);
    mockedUpdate.mockImplementation(() => updateChain);

    const { status, body } = await readJson(await del({ invitationId: "inv-1" }));

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(updateChain.set).toHaveBeenCalledWith({ status: "cancelled" });
  });

  it("refuses to cancel a non-pending invitation", async () => {
    queueSelects(
      mockedSelect,
      [{ id: "inv-1", companyId: TEST_COMPANY_ID, status: "accepted" }],
      [adminMembership],
    );

    const { status, body } = await readJson(await del({ invitationId: "inv-1" }));

    expect(status).toBe(400);
    expect(body.error).toBe("Cannot cancel a accepted invitation");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
