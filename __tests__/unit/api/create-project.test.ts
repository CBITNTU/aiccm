import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { POST } from "@/app/api/create-project/route";
import { getAuthenticatedUser } from "@/lib/api";
import { isCompanyMember } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { virtualOrganizations, voMembers } from "@/lib/db/schema/app";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { makeChain } from "@/__tests__/helpers/drizzleMock";

// `after()` requires a live Next.js request scope — stub it, keep NextRequest etc. real.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  isCompanyMember: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logApiEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/platformVerificationSettings", () => ({
  getPlatformVerificationSettings: vi.fn(async () => ({
    verifiedProjectLimit: 5,
    unverifiedProjectLimit: 1,
    unverifiedCompetencyLimit: 5,
  })),
}));

const mockedGetAuthenticatedUser = getAuthenticatedUser as unknown as Mock;
const mockedIsCompanyMember = isCompanyMember as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;
const mockedInsert = db.insert as unknown as Mock;
const mockedDelete = db.delete as unknown as Mock;

const projectRow = {
  id: "vo-1",
  name: "New VO",
  leadCompanyId: TEST_COMPANY_ID,
  status: "draft",
};

function queueSelects(...results: unknown[]) {
  for (const result of results) {
    mockedSelect.mockImplementationOnce(() => makeChain(() => result));
  }
}

function requestBody(overrides: Record<string, unknown> = {}) {
  return makeRequest("/api/create-project", {
    method: "POST",
    json: {
      name: "New VO",
      description: "A consortium",
      targetTenderId: null,
      companyId: TEST_COMPANY_ID,
      ...overrides,
    },
  });
}

describe("POST /api/create-project", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockedGetAuthenticatedUser.mockResolvedValue({ user: mockUser(), error: null });
    mockedIsCompanyMember.mockResolvedValue(true);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedGetAuthenticatedUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const { status, body } = await readJson(await POST(requestBody()));

    expect(status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when the user is not a member of the lead company", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);

    const { status, body } = await readJson(await POST(requestBody()));

    expect(status).toBe(403);
    expect(body.error).toBe("Company not found or unauthorized");
    expect(mockedInsert).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-archived VO already exists for an unverified lead company (limit 1)", async () => {
    queueSelects(
      [{ verificationStatus: "unverified" }], // company lookup
      [{ value: 1 }], // count of non-archived VOs for lead company
    );

    const { status, body } = await readJson(await POST(requestBody()));

    expect(status).toBe(403);
    expect(body.error).toBe(
      "Unverified companies can create up to 1 active project(s). Get your company verified to unlock more projects.",
    );
    expect(mockedInsert).not.toHaveBeenCalled();
  });

  it("inserts the VO then the lead voMembers row on the happy path", async () => {
    queueSelects([{ verificationStatus: "verified" }], [{ value: 0 }]);
    const voChain = makeChain(() => [projectRow]);
    const memberChain = makeChain(() => undefined);
    mockedInsert
      .mockImplementationOnce(() => voChain)
      .mockImplementationOnce(() => memberChain);

    const { status, body } = await readJson(await POST(requestBody()));

    expect(status).toBe(200);
    expect(body.project).toMatchObject({ id: "vo-1", name: "New VO" });

    expect(mockedInsert).toHaveBeenNthCalledWith(1, virtualOrganizations);
    expect(voChain.values).toHaveBeenCalledWith({
      name: "New VO",
      description: "A consortium",
      leadCompanyId: TEST_COMPANY_ID,
      targetTenderId: null,
      status: "draft",
      projectOwnerId: TEST_USER_ID,
    });
    expect(voChain.returning).toHaveBeenCalled();

    expect(mockedInsert).toHaveBeenNthCalledWith(2, voMembers);
    expect(memberChain.values).toHaveBeenCalledWith({
      voId: "vo-1",
      companyId: TEST_COMPANY_ID,
      role: "lead",
    });
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("compensates by deleting the VO when the lead-member insert fails", async () => {
    queueSelects([{ verificationStatus: "verified" }], [{ value: 0 }]);
    const voChain = makeChain(() => [projectRow]);
    const failingMemberChain = makeChain(() => {
      throw new Error("insert failed");
    });
    mockedInsert
      .mockImplementationOnce(() => voChain)
      .mockImplementationOnce(() => failingMemberChain);
    const deleteChain = makeChain(() => undefined);
    mockedDelete.mockImplementation(() => deleteChain);

    const { status, body } = await readJson(await POST(requestBody()));

    expect(status).toBe(500);
    expect(body.error).toBe("Failed to create project");
    expect(mockedDelete).toHaveBeenCalledWith(virtualOrganizations);
    expect(deleteChain.where).toHaveBeenCalledTimes(1);
  });
});
