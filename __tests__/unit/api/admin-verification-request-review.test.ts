import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PUT } from "@/app/api/admin/verification-requests/[requestId]/route";
import { requireAuth } from "@/lib/api/validation";
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
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

vi.mock("@/lib/services/embeddingService", () => ({
  refreshCompanyEmbedding: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
  getVerificationReviewEmailSubject: vi.fn(() => "subject"),
  getVerificationReviewEmailHtml: vi.fn(() => "<p>html</p>"),
}));

vi.mock("@/lib/email/i18n", () => ({
  getEmailLocale: vi.fn(async () => "en"),
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedCheckSuperadminRole = checkSuperadminRole as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;
const mockedTransaction = db.transaction as unknown as Mock;
const mockedRefresh = vi.mocked(refreshCompanyEmbedding);

const REQUEST_ID = "00000000-0000-4000-8000-0000000000b1";

function reviewRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    companyId: TEST_COMPANY_ID,
    submittedBy: "submitter-1",
    status: "pending",
    requestType: "change_review",
    pendingChangesSnapshot: {
      scalarFields: {
        description: { current: "Old", proposed: "We build bridges" },
      },
    },
    ...overrides,
  };
}

/**
 * Reads in order: the request row, then (post-transaction) the submitter and
 * the company for the notification email.
 */
function queueReads(request: unknown) {
  const queue: unknown[][] = [
    [request],
    [{ name: "Submitter", email: "submitter@example.com" }],
    [{ companyName: "Test Construction Ltd" }],
  ];
  mockedSelect.mockImplementation(() => makeChain(() => queue.shift() ?? []));
}

function put(action: string) {
  return PUT(
    makeRequest(`/api/admin/verification-requests/${REQUEST_ID}`, {
      method: "PUT",
      json: { action },
    }),
    routeParams({ requestId: REQUEST_ID }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireAuth.mockResolvedValue({ user: mockUser() });
  mockedCheckSuperadminRole.mockResolvedValue(true);
  mockedTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      update: () => makeChain(() => undefined),
      insert: () => makeChain(() => undefined),
      delete: () => makeChain(() => undefined),
    }),
  );
});

describe("PUT /api/admin/verification-requests/[requestId] — embedding refresh", () => {
  it("refreshes the embedding when a change review is approved", async () => {
    // Approving is the moment a verified company's queued edits actually land in
    // the columns — before this, the vector stayed on the pre-edit profile.
    queueReads(reviewRequest());

    const { status } = await readJson(await put("approve"));

    expect(status).toBe(200);
    expect(mockedRefresh).toHaveBeenCalledWith(TEST_COMPANY_ID);
  });

  it("refreshes after the transaction commits, not inside it", async () => {
    // The embed does a provider round-trip; holding a transaction open for it
    // would pin a connection for the duration.
    queueReads(reviewRequest());
    let refreshedDuringTransaction = false;
    mockedTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const result = await fn({
        update: () => makeChain(() => undefined),
        insert: () => makeChain(() => undefined),
        delete: () => makeChain(() => undefined),
      });
      refreshedDuringTransaction = mockedRefresh.mock.calls.length > 0;
      return result;
    });

    await put("approve");

    expect(refreshedDuringTransaction).toBe(false);
    expect(mockedRefresh).toHaveBeenCalledOnce();
  });

  it("does not refresh when a change review is rejected", async () => {
    // Reject leaves pendingChanges in place and writes no profile columns.
    queueReads(reviewRequest());

    const { status } = await readJson(await put("reject"));

    expect(status).toBe(200);
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it("does not refresh when approving an initial verification", async () => {
    // Initial approval only flips verificationStatus — no embedding-source data.
    queueReads(reviewRequest({ requestType: "verification" }));

    const { status } = await readJson(await put("approve"));

    expect(status).toBe(200);
    expect(mockedRefresh).not.toHaveBeenCalled();
  });
});
