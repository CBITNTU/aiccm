import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getStatus } from "@/app/api/match-tenders/status/route";
import { GET as getProgress } from "@/app/api/match-tenders/progress/route";
import { getAuthenticatedUser } from "@/lib/api";
import {
  AuthError,
  getUserCompanyIds,
  isCompanyMember,
  requireAuth,
} from "@/lib/api/validation";
import {
  getBatchStatus,
  getMatchingJobsForCompany,
  reconcileBatch,
} from "@/lib/services/queueService";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser, TEST_COMPANY_ID } from "@/__tests__/helpers/mocks";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
  getUserCompanyIds: vi.fn(),
  isCompanyMember: vi.fn(),
}));

vi.mock("@/lib/services/queueService", () => ({
  getMatchingJobsForCompany: vi.fn(),
  getBatchStatus: vi.fn(),
  reconcileBatch: vi.fn(),
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logApiEvent: vi.fn(async () => {}),
}));

const user = mockUser();

type Batch = NonNullable<Awaited<ReturnType<typeof getBatchStatus>>>;

function batch(overrides: Partial<Batch> = {}): Batch {
  return {
    id: "batch-1",
    batchType: "tender_matching",
    totalJobs: 4,
    completedJobs: 1,
    failedJobs: 1,
    companyId: TEST_COMPANY_ID,
    status: "processing",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:05:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user } as never);
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ user, error: null });
  vi.mocked(getUserCompanyIds).mockResolvedValue([TEST_COMPANY_ID]);
  vi.mocked(isCompanyMember).mockResolvedValue(true);
});

describe("GET /api/match-tenders/status", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new AuthError("Unauthorized"));

    const { status } = await readJson(
      await getStatus(makeRequest("/api/match-tenders/status")),
    );
    expect(status).toBe(401);
  });

  it("returns 404 when the user has no companies", async () => {
    vi.mocked(getUserCompanyIds).mockResolvedValue([]);

    const { status, body } = await readJson(
      await getStatus(makeRequest("/api/match-tenders/status")),
    );
    expect(status).toBe(404);
    expect(body.error).toBe("Company not found for user");
  });

  it("reports job counts, an ETA, and only completed results", async () => {
    vi.mocked(getMatchingJobsForCompany).mockResolvedValue({
      total: 4,
      pending: 1,
      processing: 1,
      completed: 1,
      failed: 1,
      results: [
        {
          status: "completed",
          tenderId: "t1",
          resultData: { overallScore: 80 },
          completedAt: new Date("2026-08-01T10:04:00.000Z"),
        },
        { status: "pending", tenderId: "t2", resultData: null, completedAt: null },
      ] as never,
    });

    const { status, body } = await readJson(
      await getStatus(makeRequest("/api/match-tenders/status")),
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      total: 4,
      completed: 1,
      processing: 1,
      pending: 1,
      failed: 1,
      estimatedSeconds: 10, // (1 processing + 1 pending) × 5s
    });
    const results = body.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      tenderId: "t1",
      score: { overallScore: 80 },
    });
    expect(getMatchingJobsForCompany).toHaveBeenCalledWith(TEST_COMPANY_ID);
  });
});

describe("GET /api/match-tenders/progress", () => {
  function progressRequest(batchId?: string) {
    return getProgress(
      makeRequest("/api/match-tenders/progress", {
        searchParams: batchId ? { batchId } : {},
      }),
    );
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      error: "Unauthorized",
    });

    const { status } = await readJson(await progressRequest("batch-1"));
    expect(status).toBe(401);
  });

  it("returns 400 without a batchId", async () => {
    const { status, body } = await readJson(await progressRequest());
    expect(status).toBe(400);
    expect(body.error).toBe("Batch ID is required");
  });

  it("returns 404 for an unknown batch", async () => {
    vi.mocked(getBatchStatus).mockResolvedValue(null);

    const { status } = await readJson(await progressRequest("nope"));
    expect(status).toBe(404);
  });

  it("returns 403 when the user is not a member of the batch's company", async () => {
    vi.mocked(getBatchStatus).mockResolvedValue(batch());
    vi.mocked(isCompanyMember).mockResolvedValue(false);

    const { status, body } = await readJson(await progressRequest("batch-1"));

    expect(status).toBe(403);
    expect(body.error).toBe("Access denied");
    expect(reconcileBatch).not.toHaveBeenCalled();
  });

  it("returns reconciled progress with a rounded percentage", async () => {
    vi.mocked(getBatchStatus).mockResolvedValue(batch());
    vi.mocked(reconcileBatch).mockResolvedValue(
      batch({ completedJobs: 2, failedJobs: 1 }),
    );

    const { status, body } = await readJson(await progressRequest("batch-1"));

    expect(status).toBe(200);
    expect(body).toMatchObject({
      batchId: "batch-1",
      totalJobs: 4,
      completedJobs: 2,
      failedJobs: 1,
      status: "processing",
      progressPercent: 75, // (2+1)/4
    });
  });

  it("falls back to the unreconciled batch and handles totalJobs = 0", async () => {
    vi.mocked(getBatchStatus).mockResolvedValue(
      batch({ totalJobs: 0, completedJobs: 0, failedJobs: 0 }),
    );
    vi.mocked(reconcileBatch).mockResolvedValue(null);

    const { status, body } = await readJson(await progressRequest("batch-1"));

    expect(status).toBe(200);
    expect(body.progressPercent).toBe(0);
  });
});
