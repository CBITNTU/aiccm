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

const mockedBlobDelete = vi.fn(async () => {});
vi.mock("@/lib/storage", () => ({
  getBlobStore: () => ({ isConfigured: true, delete: mockedBlobDelete }),
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
 * Reads in order: the request row; then, only when approving a change review,
 * the live logo the route reads before the transaction can overwrite it; then
 * (post-transaction) the submitter and the company for the notification email.
 */
function queueReads(
  request: Record<string, unknown>,
  { action = "approve", liveLogoUrl = null }: { action?: string; liveLogoUrl?: string | null } = {},
) {
  const queue: unknown[][] = [[request]];
  if (request.requestType === "change_review" && action === "approve") {
    queue.push([{ logoUrl: liveLogoUrl }]);
  }
  queue.push([{ name: "Submitter", email: "submitter@example.com" }]);
  queue.push([{ companyName: "Test Construction Ltd" }]);
  mockedSelect.mockImplementation(() => makeChain(() => queue.shift() ?? []));
}

/** Captures every `tx.update(...).set(...)` payload written inside the transaction. */
function captureUpdates(): Record<string, unknown>[] {
  const sets: Record<string, unknown>[] = [];
  mockedTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      update: () => {
        const chain = makeChain(() => undefined);
        chain.set.mockImplementation((values: Record<string, unknown>) => {
          sets.push(values);
          return chain;
        });
        return chain;
      },
      insert: () => makeChain(() => undefined),
      delete: () => makeChain(() => undefined),
    }),
  );
  return sets;
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
    queueReads(reviewRequest(), { action: "reject" });

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

describe("PUT /api/admin/verification-requests/[requestId] — logo promotion", () => {
  const LIVE_LOGO = "https://blob.example.com/company-logos/c/live.png";
  const STAGED_LOGO = "https://blob.example.com/company-logos/c/pending/new.png";

  function logoRequest(proposed: string | null) {
    return reviewRequest({
      pendingChangesSnapshot: {
        scalarFields: { logoUrl: { current: LIVE_LOGO, proposed } },
      },
    });
  }

  /** The single update that carries the promoted profile columns. */
  function profileUpdate(sets: Record<string, unknown>[]) {
    return sets.find((set) => "logoUrl" in set || "logoSource" in set);
  }

  it("stamps logoSource and logoUpdatedAt alongside the promoted URL", async () => {
    // The generic REVIEWABLE_SCALAR_FIELDS loop only writes logo_url. Without
    // logo_source = 'upload', website discovery treats the member's approved
    // logo as auto-sourced and is free to overwrite it.
    const sets = captureUpdates();
    queueReads(logoRequest(STAGED_LOGO), { liveLogoUrl: LIVE_LOGO });

    const { status } = await readJson(await put("approve"));

    expect(status).toBe(200);
    const update = profileUpdate(sets);
    expect(update).toMatchObject({ logoUrl: STAGED_LOGO, logoSource: "upload" });
    expect(update?.logoUpdatedAt).toBeInstanceOf(Date);
  });

  it("clears logoSource when the approved change is a logo removal", async () => {
    // A staged `proposed: null` is a deliberate removal — leaving logo_source at
    // 'upload' would claim a manual logo that no longer exists.
    const sets = captureUpdates();
    queueReads(logoRequest(null), { liveLogoUrl: LIVE_LOGO });

    const { status } = await readJson(await put("approve"));

    expect(status).toBe(200);
    expect(profileUpdate(sets)).toMatchObject({ logoUrl: null, logoSource: null });
  });

  it("leaves logo columns alone when the change review has no logo draft", async () => {
    const sets = captureUpdates();
    queueReads(reviewRequest(), { liveLogoUrl: LIVE_LOGO });

    await put("approve");

    const update = profileUpdate(sets);
    expect(update).toBeUndefined();
    expect(sets.some((set) => "logoSource" in set)).toBe(false);
  });

  it("deletes the superseded logo object after promotion", async () => {
    queueReads(logoRequest(STAGED_LOGO), { liveLogoUrl: LIVE_LOGO });

    await put("approve");

    expect(mockedBlobDelete).toHaveBeenCalledWith(LIVE_LOGO);
  });
});
