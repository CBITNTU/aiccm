import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { POST } from "@/app/api/match-tenders/route";
import { getAuthenticatedUser, checkSuperadminRole } from "@/lib/api";
import { isCompanyMember } from "@/lib/api/validation";
import {
  findTenderIdsWithCachedMatches,
  resolveMatchingJobMetadata,
} from "@/lib/services/tenderMatchingService";
import { enqueueBatch, getBatchStatus } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";
import {
  getEffectiveMatchingLimit,
  getMatchingRunsThisMonth,
} from "@/lib/matchingUsage";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { queueSelects } from "@/__tests__/helpers/drizzleMock";

// `getCompanyAccess` stays real — only its inputs (`isCompanyMember`,
// `checkSuperadminRole`) are stubbed, so the route exercises the real
// member-or-superadmin rule.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAuthenticatedUser: vi.fn(),
  checkSuperadminRole: vi.fn(),
}));

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  isCompanyMember: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    // markCompanyAdminPrepared: update().set().where()
    update: vi.fn(() => ({ set: () => ({ where: async () => {} }) })),
  },
}));

vi.mock("@/lib/ai", () => ({
  aiGenerateObject: vi.fn(),
  getMatchingModelFromEnv: vi.fn(() => undefined),
  isOllamaModelId: vi.fn(() => false),
}));

// Keep splitTendersForDeepMatch real; stub the IO/metadata functions.
vi.mock("@/lib/services/tenderMatchingService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/services/tenderMatchingService")
  >()),
  findTenderIdsWithCachedMatches: vi.fn(),
  resolveMatchingJobMetadata: vi.fn(),
}));

vi.mock("@/lib/services/queueService", () => ({
  enqueueBatch: vi.fn(),
  getBatchStatus: vi.fn(),
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logApiEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/platformMatchingSettings", () => ({
  getPlatformMatchingSettings: vi.fn(async () => ({
    verifiedMatchingLimit: 100,
    unverifiedMatchingLimit: 10,
  })),
}));

vi.mock("@/lib/matchingUsage", () => ({
  getMatchingRunsThisMonth: vi.fn(),
  getEffectiveMatchingLimit: vi.fn(),
  getNextMonthStart: vi.fn(() => new Date("2026-09-01T00:00:00.000Z")),
}));

const mockedGetAuthenticatedUser = vi.mocked(getAuthenticatedUser);
const mockedIsCompanyMember = vi.mocked(isCompanyMember);
const mockedSelect = db.select as unknown as Mock;
const mockedEnqueueBatch = vi.mocked(enqueueBatch);
const mockedFindCached = vi.mocked(findTenderIdsWithCachedMatches);
const mockedResolveMetadata = vi.mocked(resolveMatchingJobMetadata);

const user = mockUser();

function companyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_COMPANY_ID,
    companyName: "Test Construction Ltd",
    description: "We build things",
    keyCapabilities: "civil engineering",
    postcode: "AB1 2CD",
    pastProjects: null,
    certifications: null,
    equipment: null,
    safetyRating: null,
    digitalMaturity: null,
    matchingRunsLimit: null,
    verificationStatus: "unverified",
    usageResetAt: null,
    ...overrides,
  };
}

function post(json?: Record<string, unknown>) {
  return POST(
    makeRequest("/api/match-tenders", {
      method: "POST",
      json: json ?? { companyId: TEST_COMPANY_ID },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Never let the fire-and-forget worker trigger hit the network.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, statusText: "OK" })));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  mockedGetAuthenticatedUser.mockResolvedValue({ user, error: null });
  mockedIsCompanyMember.mockResolvedValue(true);
  vi.mocked(checkSuperadminRole).mockResolvedValue(false);
  mockedFindCached.mockResolvedValue(new Set());
  mockedResolveMetadata.mockResolvedValue({
    metadata: { model: "gpt-5-mini" },
    matchingModel: "gpt-5-mini",
  });
  vi.mocked(getMatchingRunsThisMonth).mockResolvedValue(0);
  vi.mocked(getEffectiveMatchingLimit).mockReturnValue(10);
  mockedEnqueueBatch.mockResolvedValue({
    batchId: "batch-1",
    jobIds: ["j1", "j2"],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/match-tenders", () => {
  it("returns 401 when unauthenticated", async () => {
    mockedGetAuthenticatedUser.mockResolvedValue({
      user: null,
      error: "Unauthorized",
    });

    const { status, body } = await readJson(await post());

    expect(status).toBe(401);
    expect(body.error).toMatch(/sign in again/i);
  });

  it("returns 404 when the user has no access to the requested company", async () => {
    mockedIsCompanyMember.mockResolvedValue(false);

    const { status, body } = await readJson(await post());

    expect(status).toBe(404);
    expect(body.error).toContain("access denied");
    expect(mockedSelect).not.toHaveBeenCalled();
  });

  it("returns 404 when the requested company is not active", async () => {
    queueSelects(mockedSelect, []); // company lookup finds nothing

    const { status, body } = await readJson(await post());

    expect(status).toBe(404);
    expect(body.error).toContain("not found or not active");
  });

  it("returns 404 when the user has no active company at all (no companyId given)", async () => {
    // own-company lookup → none; membership lookup → none
    queueSelects(mockedSelect, [], []);

    const { status, body } = await readJson(await post({}));

    expect(status).toBe(404);
    expect(body.error).toBe("No active company found for user");
  });

  it("reports up-to-date when there are no open tenders", async () => {
    queueSelects(mockedSelect, [companyRow()], [], []);

    const { status, body } = await readJson(await post());

    expect(status).toBe(200);
    expect(body).toMatchObject({ analyzedCount: 0, upToDate: true });
    expect(mockedEnqueueBatch).not.toHaveBeenCalled();
  });

  it("reports up-to-date with skippedCount when every tender is cached", async () => {
    queueSelects(mockedSelect, [companyRow()], [], [{ id: "t1" }, { id: "t2" }]);
    mockedFindCached.mockResolvedValue(new Set(["t1", "t2"]));

    const { status, body } = await readJson(await post());

    expect(status).toBe(200);
    expect(body).toMatchObject({
      message: "All tenders already analyzed",
      upToDate: true,
      skippedCount: 2,
    });
    expect(mockedEnqueueBatch).not.toHaveBeenCalled();
  });

  it("returns already_running when a processing batch exists for the company", async () => {
    queueSelects(
      mockedSelect,
      [companyRow()],
      [],
      [{ id: "t1" }],
      [{ id: "batch-0", status: "processing", createdAt: new Date(), totalJobs: 7 }],
    );
    vi.mocked(getBatchStatus).mockResolvedValue({
      completedJobs: 3,
    } as Awaited<ReturnType<typeof getBatchStatus>>);

    const { status, body } = await readJson(await post());

    expect(status).toBe(200);
    expect(body).toMatchObject({
      status: "already_running",
      batchId: "batch-0",
      totalTenders: 7,
    });
    expect(mockedEnqueueBatch).not.toHaveBeenCalled();
  });

  it("returns 429 with usage details when the monthly limit is reached", async () => {
    queueSelects(mockedSelect, [companyRow()], [], [{ id: "t1" }], []);
    vi.mocked(getMatchingRunsThisMonth).mockResolvedValue(10);
    vi.mocked(getEffectiveMatchingLimit).mockReturnValue(10);

    const { status, body } = await readJson(await post());

    expect(status).toBe(429);
    expect(body).toMatchObject({
      limitExceeded: true,
      used: 10,
      limit: 10,
      resetsAt: "2026-09-01T00:00:00.000Z",
    });
    expect(mockedEnqueueBatch).not.toHaveBeenCalled();
  });

  it("queues a tender_matching batch for uncached tenders and logs the event", async () => {
    queueSelects(
      mockedSelect,
      [companyRow()],
      [], // no junction capabilities
      [{ id: "t1" }, { id: "t2" }, { id: "t3" }],
      [], // no existing batch
    );
    mockedFindCached.mockResolvedValue(new Set(["t2"]));

    const { status, body } = await readJson(await post());

    expect(status).toBe(200);
    expect(body).toMatchObject({
      message: "Tender matching started",
      batchId: "batch-1",
      totalTenders: 2,
      skippedCount: 1,
      queuedJobs: 2,
      matchingModel: "gpt-5-mini",
      status: "processing",
    });

    expect(mockedEnqueueBatch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          jobType: "tender_matching",
          entityType: "tender",
          entityId: "t1",
          tenderId: "t1",
          companyId: TEST_COMPANY_ID,
          priority: 5,
          metadata: { model: "gpt-5-mini", force: false },
        }),
        expect.objectContaining({ tenderId: "t3" }),
      ],
      "tender_matching",
      TEST_USER_ID,
      TEST_COMPANY_ID,
    );

    expect(logApiEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: "matching_started",
        entityId: TEST_COMPANY_ID,
        details: expect.objectContaining({ batchId: "batch-1", totalTenders: 2 }),
      }),
    );
  });

  it("lets a non-member superadmin match for the company, bypassing the monthly limit", async () => {
    // Admin console flow: preparing an account before approval. The company may
    // still be pending_review, and the admin's run must not burn the owner's
    // monthly allowance.
    mockedIsCompanyMember.mockResolvedValue(false);
    vi.mocked(checkSuperadminRole).mockResolvedValue(true);
    queueSelects(mockedSelect, [companyRow()], [], [{ id: "t1" }], []);
    vi.mocked(getMatchingRunsThisMonth).mockResolvedValue(10);
    vi.mocked(getEffectiveMatchingLimit).mockReturnValue(10);

    const { status, body } = await readJson(await post());

    expect(status).toBe(200);
    expect(body).toMatchObject({ batchId: "batch-1", totalTenders: 1 });
    expect(getMatchingRunsThisMonth).not.toHaveBeenCalled();
    expect(mockedEnqueueBatch).toHaveBeenCalled();
  });

  it("force=true re-queues cached tenders with force in the job metadata", async () => {
    queueSelects(mockedSelect, [companyRow()], [], [{ id: "t1" }], []);
    mockedFindCached.mockResolvedValue(new Set(["t1"]));

    const { status, body } = await readJson(
      await post({ companyId: TEST_COMPANY_ID, force: true }),
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({ totalTenders: 1, skippedCount: 0 });
    const [jobs] = mockedEnqueueBatch.mock.calls[0];
    expect(jobs[0].metadata).toEqual({ model: "gpt-5-mini", force: true });
  });
});
