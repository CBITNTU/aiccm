import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PUT } from "@/app/api/companies/[companyId]/capabilities/route";
import { isCompanyMember, requireAuth } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { db } from "@/lib/db";
import { refreshCompanyEmbedding } from "@/lib/services/embeddingService";
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
  db: { select: vi.fn(), update: vi.fn(), transaction: vi.fn() },
}));

vi.mock("@/lib/services/embeddingService", () => ({
  refreshCompanyEmbedding: vi.fn(),
}));

vi.mock("@/lib/platformVerificationSettings", () => ({
  getPlatformVerificationSettings: vi.fn(async () => ({
    verifiedProjectLimit: 5,
    unverifiedProjectLimit: 1,
    unverifiedCompetencyLimit: 5,
  })),
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedIsCompanyMember = isCompanyMember as unknown as Mock;
const mockedCheckSuperadminRole = checkSuperadminRole as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;
const mockedTransaction = db.transaction as unknown as Mock;
const mockedRefresh = vi.mocked(refreshCompanyEmbedding);

const CAP_A = "00000000-0000-4000-8000-0000000000a1";
const CAP_B = "00000000-0000-4000-8000-0000000000a2";

function queueSelect(rows: unknown[]) {
  mockedSelect.mockImplementationOnce(() => makeChain(() => rows));
}

function put(capabilityIds: string[]) {
  return PUT(
    makeRequest(`/api/companies/${TEST_COMPANY_ID}/capabilities`, {
      method: "PUT",
      json: { capabilityIds },
    }),
    routeParams({ companyId: TEST_COMPANY_ID }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireAuth.mockResolvedValue({ user: mockUser() });
  mockedIsCompanyMember.mockResolvedValue(true);
  mockedCheckSuperadminRole.mockResolvedValue(false);
  (db.update as unknown as Mock).mockImplementation(() => makeChain(() => undefined));
  mockedTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      insert: () => makeChain(() => undefined),
      delete: () => makeChain(() => undefined),
    }),
  );
});

describe("PUT /api/companies/[companyId]/capabilities — embedding refresh", () => {
  it("refreshes the embedding after a direct competency sync", async () => {
    // The reported bug: competency labels are part of the embedding source, but
    // syncing them left the company vector stale, so matching never improved.
    queueSelect([{ verificationStatus: "unverified" }]); // company lookup
    queueSelect([{ capabilityId: CAP_A }]); // current capabilities
    queueSelect([{ id: CAP_B, name: "Bridges", category: "Civil" }]); // updated read-back

    const { status } = await readJson(await put([CAP_B]));

    expect(status).toBe(200);
    expect(mockedTransaction).toHaveBeenCalledOnce();
    expect(mockedRefresh).toHaveBeenCalledWith(TEST_COMPANY_ID);
  });

  it("does not refresh when the edit only lands in pendingChanges", async () => {
    // A verified company's edits go to a draft; no column changes, so a refresh
    // would be wasted work (and would embed the pre-edit profile).
    queueSelect([{ verificationStatus: "verified" }]);
    queueSelect([{ capabilityId: CAP_A }]);
    queueSelect([]); // no pending change_review lock
    queueSelect([{ pendingChanges: null }]);

    const { status, body } = await readJson(await put([CAP_B]));

    expect(status).toBe(200);
    expect(body.pendingReview).toBe(true);
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it("does not refresh when the requested set matches the current one", async () => {
    queueSelect([{ verificationStatus: "unverified" }]);
    queueSelect([{ capabilityId: CAP_A }]);

    const { status } = await readJson(await put([CAP_A]));

    expect(status).toBe(200);
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(mockedRefresh).not.toHaveBeenCalled();
  });
});
