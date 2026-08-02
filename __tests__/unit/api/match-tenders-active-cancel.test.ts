import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getActive } from "@/app/api/match-tenders/active/route";
import { POST as postCancel } from "@/app/api/match-tenders/cancel/route";
import { getAuthenticatedUser } from "@/lib/api";
import {
  AuthError,
  getUserCompanyIds,
  isCompanyMember,
  requireAuth,
} from "@/lib/api/validation";
import {
  cancelBatch,
  getActiveMatchingBatchForCompany,
  getBatchStatus,
} from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";
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
  getActiveMatchingBatchForCompany: vi.fn(),
  getBatchStatus: vi.fn(),
  cancelBatch: vi.fn(),
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logApiEvent: vi.fn(async () => {}),
}));

const user = mockUser();
const OTHER_COMPANY_ID = "00000000-0000-4000-8000-0000000000ee";

type Batch = NonNullable<Awaited<ReturnType<typeof getBatchStatus>>>;

function batch(overrides: Partial<Batch> = {}): Batch {
  return {
    id: "batch-1",
    batchType: "tender_matching",
    totalJobs: 10,
    completedJobs: 4,
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
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(requireAuth).mockResolvedValue({ user } as never);
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ user, error: null });
  vi.mocked(getUserCompanyIds).mockResolvedValue([TEST_COMPANY_ID]);
  vi.mocked(isCompanyMember).mockResolvedValue(true);
});

describe("GET /api/match-tenders/active", () => {
  function activeRequest(companyId?: string) {
    return getActive(
      makeRequest("/api/match-tenders/active", {
        searchParams: companyId ? { companyId } : {},
      }),
    );
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new AuthError("Unauthorized"));
    const { status } = await readJson(await activeRequest());
    expect(status).toBe(401);
  });

  it("returns a null batch when the user has no companies", async () => {
    vi.mocked(getUserCompanyIds).mockResolvedValue([]);

    const { status, body } = await readJson(await activeRequest());

    expect(status).toBe(200);
    expect(body).toEqual({ batch: null });
    expect(getActiveMatchingBatchForCompany).not.toHaveBeenCalled();
  });

  it("returns a null batch when no run is active", async () => {
    vi.mocked(getActiveMatchingBatchForCompany).mockResolvedValue(null);

    const { body } = await readJson(await activeRequest());
    expect(body).toEqual({ batch: null });
    expect(getActiveMatchingBatchForCompany).toHaveBeenCalledWith(
      TEST_COMPANY_ID,
    );
  });

  it("returns the active batch with a progress percentage", async () => {
    vi.mocked(getActiveMatchingBatchForCompany).mockResolvedValue(batch());

    const { status, body } = await readJson(await activeRequest());

    expect(status).toBe(200);
    expect(body.batch).toMatchObject({
      batchId: "batch-1",
      totalJobs: 10,
      completedJobs: 4,
      failedJobs: 1,
      status: "processing",
      progressPercent: 50, // (4+1)/10
    });
  });

  it("honours an explicit companyId only when the user belongs to it", async () => {
    vi.mocked(getUserCompanyIds).mockResolvedValue([
      TEST_COMPANY_ID,
      OTHER_COMPANY_ID,
    ]);
    vi.mocked(getActiveMatchingBatchForCompany).mockResolvedValue(null);

    await readJson(await activeRequest(OTHER_COMPANY_ID));
    expect(getActiveMatchingBatchForCompany).toHaveBeenLastCalledWith(
      OTHER_COMPANY_ID,
    );

    // A foreign companyId falls back to the user's primary company.
    await readJson(await activeRequest("00000000-0000-4000-8000-0000000000ff"));
    expect(getActiveMatchingBatchForCompany).toHaveBeenLastCalledWith(
      TEST_COMPANY_ID,
    );
  });
});

describe("POST /api/match-tenders/cancel", () => {
  function cancelRequest(json?: Record<string, unknown>) {
    return postCancel(
      makeRequest("/api/match-tenders/cancel", {
        method: "POST",
        ...(json !== undefined && { json }),
      }),
    );
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      error: "Unauthorized",
    });
    const { status } = await readJson(await cancelRequest({ batchId: "b1" }));
    expect(status).toBe(401);
  });

  it("returns 400 without a batchId (including an unparsable body)", async () => {
    const { status: s1 } = await readJson(await cancelRequest({}));
    expect(s1).toBe(400);

    const { status: s2, body } = await readJson(await cancelRequest());
    expect(s2).toBe(400);
    expect(body.error).toBe("Batch ID is required");
  });

  it("returns 404 for an unknown batch", async () => {
    vi.mocked(getBatchStatus).mockResolvedValue(null);
    const { status } = await readJson(await cancelRequest({ batchId: "b1" }));
    expect(status).toBe(404);
  });

  it("returns 403 for a non-member and does not cancel", async () => {
    vi.mocked(getBatchStatus).mockResolvedValue(batch());
    vi.mocked(isCompanyMember).mockResolvedValue(false);

    const { status } = await readJson(await cancelRequest({ batchId: "batch-1" }));

    expect(status).toBe(403);
    expect(cancelBatch).not.toHaveBeenCalled();
  });

  it("cancels the batch and logs the event", async () => {
    vi.mocked(getBatchStatus).mockResolvedValue(batch());
    vi.mocked(cancelBatch).mockResolvedValue({
      cancelled: true,
      status: "cancelled",
      deletedPending: 5,
      cancelledInFlight: 1,
    });

    const { status, body } = await readJson(
      await cancelRequest({ batchId: "batch-1" }),
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      message: "Matching cancelled successfully",
      batchId: "batch-1",
      cancelled: true,
      status: "cancelled",
      deletedPending: 5,
      cancelledInFlight: 1,
    });
    expect(logApiEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: "matching_cancelled",
        entityId: "batch-1",
      }),
    );
  });

  it("still returns 200 when the batch was already terminal (idempotent no-op)", async () => {
    vi.mocked(getBatchStatus).mockResolvedValue(batch({ status: "completed" }));
    vi.mocked(cancelBatch).mockResolvedValue({
      cancelled: false,
      status: "completed",
      deletedPending: 0,
      cancelledInFlight: 0,
    });

    const { status, body } = await readJson(
      await cancelRequest({ batchId: "batch-1" }),
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      message: "Batch already completed",
      cancelled: false,
      status: "completed",
    });
  });
});
