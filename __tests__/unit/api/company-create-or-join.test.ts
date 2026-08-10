import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { POST } from "@/app/api/company/create-or-join/route";
import { AuthError, requireAuth } from "@/lib/api/validation";
import {
  createCompany,
  createCompanyJoinRequest,
  createCompanyMember,
  createUserRole,
  deleteUserRole,
  getProfileByUserId,
  updateProfileByUserId,
} from "@/lib/db/queries";
import { sendEmail } from "@/lib/email";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { queueSelects } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getProfileByUserId: vi.fn(),
  updateProfileByUserId: vi.fn(),
  createCompany: vi.fn(),
  createCompanyMember: vi.fn(),
  createUserRole: vi.fn(),
  deleteUserRole: vi.fn(),
  createCompanyJoinRequest: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => {}),
  getAdminNotificationEmailSubject: vi.fn(() => "subject"),
  getAdminNotificationEmailHtml: vi.fn(() => "<p>html</p>"),
  getCompanyJoinRequestEmailSubject: vi.fn(() => "subject"),
  getCompanyJoinRequestEmailHtml: vi.fn(() => "<p>html</p>"),
}));

vi.mock("@/lib/email/i18n", () => ({
  getEmailLocale: vi.fn(async () => "en"),
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logApiEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/services/embeddingService", () => ({
  refreshCompanyEmbedding: vi.fn(async () => {}),
}));

vi.mock("@/lib/geocode", () => ({
  isGeocodingEnabled: vi.fn(() => false),
  geocodeLocation: vi.fn(),
  buildCompanyGeoQuery: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

const mockedSelect = db.select as unknown as Mock;
const user = mockUser();

function profile(overrides: Record<string, unknown> = {}) {
  return {
    approvalStatus: "approved",
    accountType: "business",
    firstName: "Jane",
    lastName: "Doe",
    jobTitle: "Director",
    ...overrides,
  };
}

function post(json: Record<string, unknown>) {
  return POST(
    makeRequest("/api/company/create-or-join", { method: "POST", json }),
  );
}

const CREATE_BODY = {
  action: "create",
  companyName: "  New Build Ltd  ",
  websiteUrl: "https://newbuild.example",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user } as never);
  vi.mocked(getProfileByUserId).mockResolvedValue(profile() as never);
  vi.mocked(createCompany).mockResolvedValue({ id: TEST_COMPANY_ID } as never);
});

describe("POST /api/company/create-or-join", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new AuthError("Unauthorized"));
    const { status } = await readJson(await post(CREATE_BODY));
    expect(status).toBe(401);
  });

  it("returns 404 without a profile and 403 when not approved", async () => {
    vi.mocked(getProfileByUserId).mockResolvedValueOnce(null as never);
    const noProfile = await readJson(await post(CREATE_BODY));
    expect(noProfile.status).toBe(404);

    vi.mocked(getProfileByUserId).mockResolvedValueOnce(
      profile({ approvalStatus: "pending" }) as never,
    );
    const notApproved = await readJson(await post(CREATE_BODY));
    expect(notApproved.status).toBe(403);
  });

  it("rejects an unknown action", async () => {
    const { status, body } = await readJson(await post({ action: "clone" }));
    expect(status).toBe(400);
    expect(body.error).toContain("Invalid action");
  });

  describe("create", () => {
    it("requires a company name and a valid website URL", async () => {
      const noName = await readJson(
        await post({ action: "create", companyName: "  " }),
      );
      expect(noName.status).toBe(400);

      const noUrl = await readJson(
        await post({ action: "create", companyName: "X Ltd" }),
      );
      expect(noUrl.status).toBe(400);
      expect(noUrl.body.error).toContain("Website URL is required");

      const badUrl = await readJson(
        await post({
          action: "create",
          companyName: "X Ltd",
          websiteUrl: "not a url",
        }),
      );
      expect(badUrl.status).toBe(400);
    });

    it("creates a pending_review company with an admin membership and sme-owner role", async () => {
      queueSelects(mockedSelect, []); // no superadmins to notify

      const { status, body } = await readJson(await post(CREATE_BODY));

      expect(status).toBe(200);
      expect(body).toMatchObject({ success: true, companyId: TEST_COMPANY_ID });

      expect(createCompany).toHaveBeenCalledWith(
        expect.objectContaining({
          companyName: "New Build Ltd", // trimmed
          userId: TEST_USER_ID,
          status: "pending_review",
          contactPerson: "Jane Doe",
          websiteUrl: "https://newbuild.example",
        }),
      );
      expect(createCompanyMember).toHaveBeenCalledWith({
        companyId: TEST_COMPANY_ID,
        userId: TEST_USER_ID,
        role: "admin",
        status: "pending",
      });
      expect(createUserRole).toHaveBeenCalledWith(TEST_USER_ID, "sme-owner");
      expect(deleteUserRole).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("converts an individual account to business on create", async () => {
      vi.mocked(getProfileByUserId).mockResolvedValue(
        profile({ accountType: "individual" }) as never,
      );
      queueSelects(mockedSelect, []);

      await readJson(await post(CREATE_BODY));

      expect(updateProfileByUserId).toHaveBeenCalledWith(TEST_USER_ID, {
        accountType: "business",
      });
      expect(deleteUserRole).toHaveBeenCalledWith(TEST_USER_ID, "individual");
    });

    it("maps a duplicate-name error to 409", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(createCompany).mockRejectedValue(
        new Error('duplicate key value violates unique constraint'),
      );

      const { status, body } = await readJson(await post(CREATE_BODY));

      expect(status).toBe(409);
      expect(body.error).toBe("A company with this name already exists");
    });
  });

  describe("join", () => {
    const JOIN_BODY = {
      action: "join",
      companyId: TEST_COMPANY_ID,
      companyName: "Existing Ltd",
      message: "Let me in",
    };
    const companyRow = {
      id: TEST_COMPANY_ID,
      companyName: "Existing Ltd",
      userId: "owner-1",
    };

    it("requires a companyId and an existing company", async () => {
      const noId = await readJson(
        await post({ action: "join", companyName: "X" }),
      );
      expect(noId.status).toBe(400);

      queueSelects(mockedSelect, []); // company lookup empty
      const missing = await readJson(await post(JOIN_BODY));
      expect(missing.status).toBe(404);
    });

    it("rejects a duplicate join request or existing membership with 409", async () => {
      queueSelects(
        mockedSelect,
        [companyRow],
        [{ id: "jr-1", status: "pending" }],
      );
      const dupRequest = await readJson(await post(JOIN_BODY));
      expect(dupRequest.status).toBe(409);
      expect(dupRequest.body.error).toContain("pending request");

      queueSelects(
        mockedSelect,
        [companyRow],
        [], // no join request
        [{ id: "m-1", status: "approved" }],
      );
      const dupMember = await readJson(await post(JOIN_BODY));
      expect(dupMember.status).toBe(409);
      expect(dupMember.body.error).toContain("already a member");
      expect(createCompanyJoinRequest).not.toHaveBeenCalled();
    });

    it("creates a pending join request and assigns the sme-member role", async () => {
      queueSelects(
        mockedSelect,
        [companyRow],
        [], // no existing request
        [], // no membership
        [], // no company admins to email
      );

      const { status, body } = await readJson(await post(JOIN_BODY));

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(createCompanyJoinRequest).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        companyId: TEST_COMPANY_ID,
        companyNameRequested: "Existing Ltd",
        message: "Let me in",
        status: "pending",
      });
      expect(createUserRole).toHaveBeenCalledWith(TEST_USER_ID, "sme-member");
    });
  });
});
