import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET, POST } from "@/app/api/queue/worker/route";
import { checkSuperadminRole, getAuthenticatedUser } from "@/lib/api";
import {
  dequeueJob,
  getBatchStatus,
  getQueueStats,
  markJobCompleted,
  markJobFailed,
  resetStaleProcessingJobs,
} from "@/lib/services/queueService";
import { processJob } from "@/lib/services/jobProcessor";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockUser } from "@/__tests__/helpers/mocks";
import { makeChain } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAuthenticatedUser: vi.fn(),
  checkSuperadminRole: vi.fn(),
}));

vi.mock("@/lib/services/queueService", () => ({
  dequeueJob: vi.fn(),
  markJobCompleted: vi.fn(),
  markJobFailed: vi.fn(),
  resetJobToPending: vi.fn(),
  resetStaleProcessingJobs: vi.fn(),
  getQueueStats: vi.fn(),
  getBatchStatus: vi.fn(),
}));

vi.mock("@/lib/services/jobProcessor", () => ({
  processJob: vi.fn(),
}));

vi.mock("@/lib/services/eventLogger", () => ({
  logEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/db", () => ({
  db: { update: vi.fn() },
}));

const SECRET = "test-queue-secret";

type Job = NonNullable<Awaited<ReturnType<typeof dequeueJob>>>;

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    jobType: "tender_summary",
    entityType: "tender",
    entityId: "t1",
    companyId: null,
    tenderId: null,
    batchId: null,
    status: "processing",
    priority: 0,
    attempts: 0,
    maxAttempts: 3,
    errorMessage: null,
    resultData: null,
    metadata: null,
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as Job;
}

function workerRequest(json: Record<string, unknown> = {}) {
  return makeRequest("/api/queue/worker", {
    method: "POST",
    json: { selfTrigger: false, ...json },
    headers: { "x-queue-secret": SECRET },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  vi.mocked(resetStaleProcessingJobs).mockResolvedValue(0);
  vi.mocked(dequeueJob).mockResolvedValue(null);
  vi.mocked(getQueueStats).mockResolvedValue({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/queue/worker authorization", () => {
  it("rejects a request with no secret and no session", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      error: "Unauthorized",
    });

    const res = await POST(
      makeRequest("/api/queue/worker", { method: "POST", json: {} }),
    );
    const { status, body } = await readJson(res);

    expect(status).toBe(401);
    expect(body.success).toBe(false);
    expect(dequeueJob).not.toHaveBeenCalled();
  });

  it("rejects an authenticated non-superadmin without the secret", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: mockUser(),
      error: null,
    });
    vi.mocked(checkSuperadminRole).mockResolvedValue(false);

    const { status } = await readJson(
      await POST(makeRequest("/api/queue/worker", { method: "POST", json: {} })),
    );
    expect(status).toBe(401);
  });

  it("allows an authenticated superadmin without the secret", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: mockUser(),
      error: null,
    });
    vi.mocked(checkSuperadminRole).mockResolvedValue(true);

    const { status, body } = await readJson(
      await POST(
        makeRequest("/api/queue/worker", {
          method: "POST",
          json: { selfTrigger: false },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("allows an internal call via the x-queue-secret header without a session", async () => {
    const { status } = await readJson(await POST(workerRequest()));
    expect(status).toBe(200);
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
  });
});

describe("POST /api/queue/worker processing loop", () => {
  it("returns zero counts on an empty queue", async () => {
    const { status, body } = await readJson(await POST(workerRequest()));

    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      processed: 0,
      errorCount: 0,
      selfTriggered: false,
    });
    expect(resetStaleProcessingJobs).toHaveBeenCalled();
  });

  it("processes dequeued jobs and marks them completed", async () => {
    vi.mocked(dequeueJob)
      .mockResolvedValueOnce(job({ id: "job-1" }))
      .mockResolvedValueOnce(job({ id: "job-2", jobType: "company_summary" }))
      .mockResolvedValue(null);
    vi.mocked(processJob).mockResolvedValue({ success: true, summary: "done" });

    const { status, body } = await readJson(await POST(workerRequest()));

    expect(status).toBe(200);
    expect(body).toMatchObject({
      processed: 2,
      errorCount: 0,
      processedIds: ["job-1", "job-2"],
    });
    expect(processJob).toHaveBeenCalledTimes(2);
    expect(markJobCompleted).toHaveBeenCalledWith("job-1", { success: true, summary: "done" });
    expect(markJobCompleted).toHaveBeenCalledWith("job-2", { success: true, summary: "done" });
    expect(markJobFailed).not.toHaveBeenCalled();
  });

  it("marks a job failed when processJob throws and keeps going", async () => {
    vi.mocked(dequeueJob)
      .mockResolvedValueOnce(job({ id: "job-bad" }))
      .mockResolvedValueOnce(job({ id: "job-good" }))
      .mockResolvedValue(null);
    vi.mocked(processJob)
      .mockRejectedValueOnce(new Error("LLM exploded"))
      .mockResolvedValueOnce({ success: true, summary: "done" });

    const { body } = await readJson(await POST(workerRequest()));

    expect(body).toMatchObject({
      processed: 1,
      errorCount: 1,
      processedIds: ["job-good"],
      errorDetails: [{ jobId: "job-bad", error: "LLM exploded" }],
    });
    expect(markJobFailed).toHaveBeenCalledWith("job-bad", "LLM exploded");
  });

  it("skips jobs whose batch is already terminal", async () => {
    vi.mocked(dequeueJob)
      .mockResolvedValueOnce(job({ id: "job-1", batchId: "batch-1" }))
      .mockResolvedValue(null);
    vi.mocked(getBatchStatus).mockResolvedValue({
      id: "batch-1",
      batchType: "tender_matching",
      totalJobs: 5,
      completedJobs: 2,
      failedJobs: 0,
      companyId: null,
      status: "cancelled",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { body } = await readJson(await POST(workerRequest()));

    expect(body.processed).toBe(0);
    expect(processJob).not.toHaveBeenCalled();
    expect(markJobFailed).toHaveBeenCalledWith(
      "job-1",
      expect.stringContaining("already cancelled"),
    );
  });

  it("completes a drifted batch that reached its job limit and skips the job", async () => {
    vi.mocked(dequeueJob)
      .mockResolvedValueOnce(job({ id: "job-1", batchId: "batch-1" }))
      .mockResolvedValue(null);
    vi.mocked(getBatchStatus).mockResolvedValue({
      id: "batch-1",
      batchType: "tender_matching",
      totalJobs: 3,
      completedJobs: 2,
      failedJobs: 1, // limit reached but still "processing" (drift)
      companyId: null,
      status: "processing",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const updateChain = makeChain(() => undefined);
    (db.update as unknown as Mock).mockImplementation(() => updateChain);

    const { body } = await readJson(await POST(workerRequest()));

    expect(body.processed).toBe(0);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
    expect(markJobFailed).toHaveBeenCalledWith(
      "job-1",
      expect.stringContaining("reached its job limit"),
    );
    expect(processJob).not.toHaveBeenCalled();
  });

  it("self-triggers two workers with the secret header when jobs remain", async () => {
    vi.mocked(getQueueStats).mockResolvedValue({
      pending: 5,
      processing: 0,
      completed: 0,
      failed: 0,
    });
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { body } = await readJson(
      await POST(workerRequest({ selfTrigger: true })),
    );

    expect(body.selfTriggered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-queue-secret"]).toBe(
      SECRET,
    );
  });
});

describe("GET /api/queue/worker", () => {
  it("returns 401 when unauthorized", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: null,
      error: "Unauthorized",
    });
    const { status } = await readJson(
      await GET(makeRequest("/api/queue/worker")),
    );
    expect(status).toBe(401);
  });

  it("returns queue stats for an authorized caller", async () => {
    vi.mocked(getQueueStats).mockResolvedValue({
      pending: 1,
      processing: 2,
      completed: 3,
      failed: 4,
    });

    const { status, body } = await readJson(
      await GET(
        makeRequest("/api/queue/worker", {
          headers: { "x-queue-secret": SECRET },
        }),
      ),
    );

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      stats: { pending: 1, processing: 2, completed: 3, failed: 4 },
    });
  });
});
