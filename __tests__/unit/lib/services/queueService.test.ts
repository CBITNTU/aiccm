import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

vi.mock("@/lib/db/raw", () => ({
  dequeueJobAtomic: vi.fn(),
  incrementBatchProgress: vi.fn(),
}));

import { dequeueJob } from "@/lib/services/queueService";
import { dequeueJobAtomic } from "@/lib/db/raw";

const mockedDequeueAtomic = vi.mocked(dequeueJobAtomic);

describe("dequeueJob snake_case → camelCase mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no job is available", async () => {
    mockedDequeueAtomic.mockResolvedValue(null);
    expect(await dequeueJob()).toBeNull();
  });

  it("maps every raw column to the ProcessingQueue shape", async () => {
    mockedDequeueAtomic.mockResolvedValue({
      id: "job-1",
      job_type: "tender_matching",
      entity_type: "tender",
      entity_id: "t1",
      company_id: "c1",
      tender_id: "t1",
      batch_id: "b1",
      status: "processing",
      priority: 10,
      attempts: 2,
      max_attempts: 5,
      error_message: "previous error",
      result_data: { partial: true },
      scheduled_at: "2026-01-01T10:00:00.000Z",
      started_at: "2026-01-01T10:05:00.000Z",
      completed_at: null,
      created_at: "2026-01-01T09:00:00.000Z",
      updated_at: "2026-01-01T10:05:00.000Z",
      metadata: { model: "gpt-5-mini" },
    } as Awaited<ReturnType<typeof dequeueJobAtomic>>);

    const job = await dequeueJob();

    expect(job).toEqual({
      id: "job-1",
      jobType: "tender_matching",
      entityType: "tender",
      entityId: "t1",
      companyId: "c1",
      tenderId: "t1",
      batchId: "b1",
      status: "processing",
      priority: 10,
      attempts: 2,
      maxAttempts: 5,
      errorMessage: "previous error",
      resultData: { partial: true },
      metadata: { model: "gpt-5-mini" },
      scheduledAt: new Date("2026-01-01T10:00:00.000Z"),
      startedAt: new Date("2026-01-01T10:05:00.000Z"),
      completedAt: null,
      createdAt: new Date("2026-01-01T09:00:00.000Z"),
      updatedAt: new Date("2026-01-01T10:05:00.000Z"),
    });
  });

  it("coalesces missing nullable columns to safe defaults", async () => {
    mockedDequeueAtomic.mockResolvedValue({
      id: "job-2",
      job_type: "tender_summary",
      entity_type: "tender",
      entity_id: "t2",
      company_id: null,
      tender_id: null,
      batch_id: null,
      status: "processing",
      priority: null,
      attempts: null,
      max_attempts: null,
      error_message: null,
      result_data: null,
      scheduled_at: null,
      started_at: null,
      completed_at: null,
      created_at: null,
      updated_at: null,
      metadata: null,
    } as unknown as Awaited<ReturnType<typeof dequeueJobAtomic>>);

    const job = await dequeueJob();

    expect(job).toMatchObject({
      companyId: null,
      tenderId: null,
      batchId: null,
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
    });
  });
});
