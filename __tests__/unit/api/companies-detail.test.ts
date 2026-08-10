import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET, PUT } from "@/app/api/companies/[companyId]/route";
import { checkSuperadminRole } from "@/lib/api";
import { isCompanyMember, requireAuth } from "@/lib/api/validation";
import { getCompanyMemberRole } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { refreshCompanyEmbedding } from "@/lib/services/embeddingService";
import { makeRequest, readJson, routeParams } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { makeChain, queueSelects, type Chain } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkSuperadminRole: vi.fn(),
}));

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
  isCompanyMember: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getCompanyMemberRole: vi.fn(),
}));

vi.mock("@/lib/geocode", () => ({
  isGeocodingEnabled: vi.fn(() => false),
  geocodeLocation: vi.fn(),
  buildCompanyGeoQuery: vi.fn(),
}));

vi.mock("@/lib/services/embeddingService", () => ({
  embedCompany: vi.fn(async () => {}),
  refreshCompanyEmbedding: vi.fn(async () => {}),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

const mockedSelect = db.select as unknown as Mock;
const mockedUpdate = db.update as unknown as Mock;
const user = mockUser();

function companyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_COMPANY_ID,
    userId: TEST_USER_ID,
    companyName: "Detail Ltd",
    description: "Original description",
    keyCapabilities: null,
    certifications: null,
    equipment: null,
    pastProjects: null,
    companiesHouseNumber: null,
    verificationStatus: "unverified",
    pendingChanges: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user } as never);
  vi.mocked(isCompanyMember).mockResolvedValue(true);
  vi.mocked(checkSuperadminRole).mockResolvedValue(false);
  vi.mocked(getCompanyMemberRole).mockResolvedValue("admin" as never);
});

describe("GET /api/companies/[companyId]", () => {
  function get() {
    return GET(
      makeRequest(`/api/companies/${TEST_COMPANY_ID}`),
      routeParams({ companyId: TEST_COMPANY_ID }),
    );
  }

  it("returns 401 for a non-member who is not a superadmin", async () => {
    vi.mocked(isCompanyMember).mockResolvedValue(false);

    const { status, body } = await readJson(await get());

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("allows a superadmin who is not a member", async () => {
    vi.mocked(isCompanyMember).mockResolvedValue(false);
    vi.mocked(checkSuperadminRole).mockResolvedValue(true);
    queueSelects(mockedSelect, [companyRow()], [], [], []);

    const { status } = await readJson(await get());
    expect(status).toBe(200);
  });

  it("returns 404 for an unknown company", async () => {
    queueSelects(mockedSelect, []);
    const { status, body } = await readJson(await get());
    expect(status).toBe(404);
    expect(body.error).toBe("Company not found");
  });

  it("returns the company with capabilities, markets and standards", async () => {
    queueSelects(
      mockedSelect,
      [companyRow()],
      [{ id: "cap-1", name: "Civil engineering", category: "Engineering" }],
      [{ id: "mkt-1", name: "Public sector", parentId: null, sortOrder: 1 }],
      [{ id: "std-1", name: "ISO 9001", parentId: null, sortOrder: 1 }],
    );

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body.company).toMatchObject({ companyName: "Detail Ltd" });
    expect(body.isOwner).toBe(true); // company.userId === caller
    expect(body.capabilities).toEqual([
      { id: "cap-1", name: "Civil engineering", category: "Engineering" },
    ]);
    expect(body.markets).toHaveLength(1);
    expect(body.standards).toHaveLength(1);
    expect(body.hasPendingChanges).toBe(false);
  });
});

describe("PUT /api/companies/[companyId]", () => {
  function put(json: Record<string, unknown>) {
    return PUT(
      makeRequest(`/api/companies/${TEST_COMPANY_ID}`, { method: "PUT", json }),
      routeParams({ companyId: TEST_COMPANY_ID }),
    );
  }

  function setupUpdate(returned: unknown[]): Chain {
    const chain = makeChain(() => returned);
    mockedUpdate.mockImplementation(() => chain);
    return chain;
  }

  it("returns 401 when the caller has no role and is not a superadmin", async () => {
    vi.mocked(getCompanyMemberRole).mockResolvedValue(null as never);

    const { status, body } = await readJson(
      await put({ description: "new" }),
    );

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
  });

  it("returns 401 for a non-admin member", async () => {
    vi.mocked(getCompanyMemberRole).mockResolvedValue("member" as never);

    const { status, body } = await readJson(await put({ description: "new" }));

    expect(status).toBe(401);
    expect(body.error).toBe("Only company admins can update company details");
  });

  it("updates whitelisted fields directly for an unverified company", async () => {
    queueSelects(mockedSelect, [companyRow()]);
    const updateChain = setupUpdate([companyRow({ description: "Updated" })]);

    const { status, body } = await readJson(
      await put({
        description: "Updated",
        status: "active", // NOT whitelisted — must be ignored
        userId: "attacker", // NOT whitelisted — must be ignored
      }),
    );

    expect(status).toBe(200);
    expect(body.company).toMatchObject({ description: "Updated" });
    expect(body.hasPendingChanges).toBe(false);

    const setArg = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.description).toBe("Updated");
    expect(setArg).not.toHaveProperty("status");
    expect(setArg).not.toHaveProperty("userId");
  });

  it("refreshes the embedding on every successful save", async () => {
    // Unconditional by design: the field whitelist this replaced drifted out of
    // sync with buildCompanySource. The source-hash guard inside
    // refreshCompanyEmbedding makes a no-change save cheap.
    queueSelects(mockedSelect, [companyRow()]);
    setupUpdate([companyRow({ contactPhone: "0999" })]);

    await put({ contactPhone: "0999" });

    expect(vi.mocked(refreshCompanyEmbedding)).toHaveBeenCalledWith(
      TEST_COMPANY_ID,
    );
  });

  it("routes reviewable fields of a verified company into pendingChanges", async () => {
    queueSelects(
      mockedSelect,
      [companyRow({ verificationStatus: "verified" })],
      [], // no pending change-review request (edit lock check)
    );
    const updateChain = setupUpdate([
      companyRow({ verificationStatus: "verified", pendingChanges: {} }),
    ]);

    const { status } = await readJson(await put({ description: "Proposed" }));

    expect(status).toBe(200);
    const setArg = updateChain.set.mock.calls[0][0] as Record<string, unknown>;
    // The live column is untouched; the proposal lands in pendingChanges.
    expect(setArg).not.toHaveProperty("description");
    expect(setArg.pendingChanges).toMatchObject({
      scalarFields: {
        description: {
          current: "Original description",
          proposed: "Proposed",
        },
      },
    });
  });

  it("blocks reviewable edits while a change review is pending", async () => {
    queueSelects(
      mockedSelect,
      [companyRow({ verificationStatus: "verified" })],
      [{ id: "vr-1" }], // pending change_review request
    );

    const { status, body } = await readJson(await put({ description: "New" }));

    expect(status).toBe(400);
    expect(body.error).toContain("change review is pending");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown company", async () => {
    queueSelects(mockedSelect, []);
    const { status } = await readJson(await put({ description: "x" }));
    expect(status).toBe(404);
  });
});
