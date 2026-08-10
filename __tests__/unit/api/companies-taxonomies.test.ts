import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET, PUT } from "@/app/api/companies/[companyId]/taxonomies/route";
import { isCompanyMember, requireAuth } from "@/lib/api/validation";
import { checkSuperadminRole } from "@/lib/api";
import { db } from "@/lib/db";
import { refreshCompanyEmbedding } from "@/lib/services/embeddingService";
import { isEmailSuppressed } from "@/lib/email/suppression";
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
  db: { select: vi.fn(), update: vi.fn(), transaction: vi.fn() },
}));

vi.mock("@/lib/services/embeddingService", () => ({
  refreshCompanyEmbedding: vi.fn(async () => {}),
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedIsCompanyMember = isCompanyMember as unknown as Mock;
const mockedCheckSuperadminRole = checkSuperadminRole as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;
const mockedUpdate = db.update as unknown as Mock;
const mockedTransaction = db.transaction as unknown as Mock;

const TAXONOMY_ID = "00000000-0000-4000-8000-0000000000a1";

function queueSelect(rows: unknown[]) {
  mockedSelect.mockImplementationOnce(() => makeChain(() => rows));
}

/** Capture whether suppression was active *inside* the handler's own frame. */
function captureSuppressionDuringWrite() {
  const seen: boolean[] = [];
  mockedTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    seen.push(isEmailSuppressed());
    return fn({ insert: () => makeChain(() => undefined), delete: () => makeChain(() => undefined) });
  });
  return seen;
}

function get() {
  return GET(
    makeRequest(`/api/companies/${TEST_COMPANY_ID}/taxonomies`),
    routeParams({ companyId: TEST_COMPANY_ID }),
  );
}

function put(taxonomyIds: string[]) {
  return PUT(
    makeRequest(`/api/companies/${TEST_COMPANY_ID}/taxonomies`, {
      method: "PUT",
      json: { taxonomyIds },
    }),
    routeParams({ companyId: TEST_COMPANY_ID }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireAuth.mockResolvedValue({ user: mockUser() });
  mockedIsCompanyMember.mockResolvedValue(true);
  mockedCheckSuperadminRole.mockResolvedValue(false);
  mockedUpdate.mockImplementation(() => ({ set: () => ({ where: async () => undefined }) }));
});

describe("GET /api/companies/[companyId]/taxonomies", () => {
  it("returns 401 for a non-member who is not a superadmin", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);

    const { status, body } = await readJson(await get());

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("lets a superadmin non-member read while preparing the account", async () => {
    // This is the exact 401 the pre-approval console hit: the taxonomy
    // selector renders on the default Company tab.
    mockedIsCompanyMember.mockResolvedValue(false);
    mockedCheckSuperadminRole.mockResolvedValue(true);
    queueSelect([{ id: TAXONOMY_ID, name: "Construction" }]);

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body.taxonomies).toEqual([{ id: TAXONOMY_ID, name: "Construction" }]);
  });
});

describe("PUT /api/companies/[companyId]/taxonomies", () => {
  it("returns 401 for a non-member who is not a superadmin", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);

    const { status } = await readJson(await put([TAXONOMY_ID]));

    expect(status).toBe(401);
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("suppresses email and stamps the marker for a superadmin non-member", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);
    mockedCheckSuperadminRole.mockResolvedValue(true);
    queueSelect([]); // no current taxonomies -> one addition
    const suppressedDuringWrite = captureSuppressionDuringWrite();

    const { status } = await readJson(await put([TAXONOMY_ID]));

    expect(status).toBe(200);
    // Asserted from inside the handler frame: AsyncLocalStorage.enterWith does
    // not survive out to the caller, so checking after the await would pass
    // even if suppression had never been enabled.
    expect(suppressedDuringWrite).toEqual([true]);
    expect(mockedUpdate).toHaveBeenCalled();
  });

  it("does not suppress email or stamp the marker for an ordinary member", async () => {
    queueSelect([]);
    const suppressedDuringWrite = captureSuppressionDuringWrite();

    const { status } = await readJson(await put([TAXONOMY_ID]));

    expect(status).toBe(200);
    expect(suppressedDuringWrite).toEqual([false]);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("does not stamp the marker when the admin's save is a no-op", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);
    mockedCheckSuperadminRole.mockResolvedValue(true);
    queueSelect([{ taxonomyId: TAXONOMY_ID }]); // already exactly this set
    captureSuppressionDuringWrite();

    const { status } = await readJson(await put([TAXONOMY_ID]));

    expect(status).toBe(200);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("refreshes the embedding when the taxonomy set changes", async () => {
    // Taxonomy names are part of the embedding source.
    queueSelect([]);
    captureSuppressionDuringWrite();

    await put([TAXONOMY_ID]);

    expect(vi.mocked(refreshCompanyEmbedding)).toHaveBeenCalledWith(
      TEST_COMPANY_ID,
    );
  });

  it("does not refresh the embedding when the save is a no-op", async () => {
    queueSelect([{ taxonomyId: TAXONOMY_ID }]);
    captureSuppressionDuringWrite();

    await put([TAXONOMY_ID]);

    expect(vi.mocked(refreshCompanyEmbedding)).not.toHaveBeenCalled();
  });

  it("rejects an oversized payload before touching the database", async () => {
    const { status, body } = await readJson(
      await put(Array.from({ length: 501 }, () => TAXONOMY_ID)),
    );

    expect(status).toBe(400);
    expect(body.error).toContain("at most 500");
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("checks membership against the authenticated user", async () => {
    queueSelect([]);
    captureSuppressionDuringWrite();

    await put([TAXONOMY_ID]);

    expect(mockedIsCompanyMember).toHaveBeenCalledWith(
      TEST_USER_ID,
      TEST_COMPANY_ID,
    );
  });
});
