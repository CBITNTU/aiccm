import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET, POST } from "@/app/api/companies/[companyId]/verification/route";
import { isCompanyMember, requireAuth } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { db } from "@/lib/db";
import { companies, companyVerificationRequests } from "@/lib/db/schema/app";
import { makeRequest, readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
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
  db: { select: vi.fn(), transaction: vi.fn() },
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedIsCompanyMember = isCompanyMember as unknown as Mock;
const mockedCheckSuperadminRole = checkSuperadminRole as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;
const mockedTransaction = db.transaction as unknown as Mock;

function companyRow(overrides: Record<string, unknown> = {}) {
  return {
    verificationStatus: "unverified",
    companyName: "Test Construction Ltd",
    description: null,
    contactEmail: "info@test.example",
    contactPhone: "01234 567890",
    postcode: "AB1 2CD",
    address: "1 Test Street",
    websiteUrl: "https://test.example",
    companiesHouseNumber: null,
    keyCapabilities: null,
    certifications: null,
    equipment: null,
    pastProjects: null,
    ...overrides,
  };
}

function queueCompanyLookup(rows: unknown[]) {
  mockedSelect.mockImplementationOnce(() => makeChain(() => rows));
}

function post(json?: Record<string, unknown>) {
  return POST(
    makeRequest(`/api/companies/${TEST_COMPANY_ID}/verification`, {
      method: "POST",
      ...(json !== undefined && { json }),
    }),
    routeParams({ companyId: TEST_COMPANY_ID }),
  );
}

function get() {
  return GET(
    makeRequest(`/api/companies/${TEST_COMPANY_ID}/verification`),
    routeParams({ companyId: TEST_COMPANY_ID }),
  );
}

describe("GET /api/companies/[companyId]/verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireAuth.mockResolvedValue({ user: mockUser() });
    mockedIsCompanyMember.mockResolvedValue(true);
    mockedCheckSuperadminRole.mockResolvedValue(false);
  });

  it("returns 401 for a non-member who is not a superadmin", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);

    const { status, body } = await readJson(await get());

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("lets a superadmin non-member read the status while preparing", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);
    mockedCheckSuperadminRole.mockResolvedValue(true);
    queueCompanyLookup([
      { verificationStatus: "unverified", verifiedAt: null, pendingChanges: null },
    ]);
    queueCompanyLookup([]);

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body.verificationStatus).toBe("unverified");
  });
});

describe("POST /api/companies/[companyId]/verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireAuth.mockResolvedValue({ user: mockUser() });
    mockedIsCompanyMember.mockResolvedValue(true);
    mockedCheckSuperadminRole.mockResolvedValue(false);
  });

  it("returns 401 when the user is not a company member (AuthError path)", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);

    const { status, body } = await readJson(await post());

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
    expect(mockedSelect).not.toHaveBeenCalled();
    expect(mockedIsCompanyMember).toHaveBeenCalledWith(TEST_USER_ID, TEST_COMPANY_ID);
  });

  it("still rejects a superadmin non-member — submitting is the owner's act", async () => {
    // Deliberate asymmetry with GET above: an admin's edits already bypass the
    // review queue, so they have nothing to submit. The console hides the
    // button; this asserts the route does not quietly grant it.
    mockedIsCompanyMember.mockResolvedValue(false);
    mockedCheckSuperadminRole.mockResolvedValue(true);

    const { status, body } = await readJson(await post());

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("returns 400 when the company is already verified", async () => {
    queueCompanyLookup([companyRow({ verificationStatus: "verified" })]);

    const { status, body } = await readJson(await post());

    expect(status).toBe(400);
    expect(body.error).toBe("Company is already verified");
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 when a verification request is already pending", async () => {
    queueCompanyLookup([companyRow({ verificationStatus: "pending_verification" })]);

    const { status, body } = await readJson(await post());

    expect(status).toBe(400);
    expect(body.error).toBe("A verification request is already pending");
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("creates a pending request and sets company to pending_verification", async () => {
    queueCompanyLookup([companyRow()]);

    const insertedRequest = {
      id: "vr-1",
      companyId: TEST_COMPANY_ID,
      status: "pending",
    };
    const insertChain = makeChain(() => [insertedRequest]);
    const updateChain = makeChain(() => undefined);
    const tx = {
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };
    mockedTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const { status, body } = await readJson(await post({ notes: "  please review  " }));

    expect(status).toBe(200);
    expect(body.verificationRequest).toMatchObject({ id: "vr-1", status: "pending" });

    expect(tx.insert).toHaveBeenCalledWith(companyVerificationRequests);
    expect(insertChain.values).toHaveBeenCalledWith({
      companyId: TEST_COMPANY_ID,
      submittedBy: TEST_USER_ID,
      status: "pending",
      submissionNotes: "please review",
      companySnapshot: {
        companyName: "Test Construction Ltd",
        description: null,
        contactEmail: "info@test.example",
        contactPhone: "01234 567890",
        postcode: "AB1 2CD",
        address: "1 Test Street",
        websiteUrl: "https://test.example",
        companiesHouseNumber: null,
        keyCapabilities: null,
        certifications: null,
        equipment: null,
        pastProjects: null,
      },
    });

    expect(tx.update).toHaveBeenCalledWith(companies);
    expect(updateChain.set).toHaveBeenCalledWith({
      verificationStatus: "pending_verification",
      updatedAt: expect.any(Date),
    });
    expect(updateChain.where).toHaveBeenCalledTimes(1);
  });

  it("returns 400 listing missing required fields", async () => {
    queueCompanyLookup([companyRow({ contactPhone: null, address: null })]);

    const { status, body } = await readJson(await post());

    expect(status).toBe(400);
    expect(body.error).toBe("Missing required fields: Phone, Address");
    expect(mockedTransaction).not.toHaveBeenCalled();
  });
});
