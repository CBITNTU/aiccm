import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { processingQueue } from "@/lib/db/schema/app";
import {
  dequeueJob,
  enqueueJob,
  getJob,
  getQueueStats,
  markJobCompleted,
  markJobFailed,
  markJobProcessing,
  resetJobToPending,
  resetStaleProcessingJobs,
} from "@/lib/services/queueService";
import { resetDb } from "../helpers/dbReset";

/** Valid uuid for the NOT NULL uuid entity_id column. */
const EID = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("queue job lifecycle (real database)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("enqueueJob inserts a pending row with defaults and dequeueJob claims it camelCased", async () => {
    const jobId = await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(1),
      metadata: { foo: "bar" },
    });

    const stored = await getJob(jobId);
    expect(stored).toMatchObject({
      id: jobId,
      jobType: "tender_summary",
      entityType: "tender",
      status: "pending",
      priority: 0,
      attempts: 0,
      companyId: null,
      tenderId: null,
      batchId: null,
      errorMessage: null,
      metadata: { foo: "bar" },
    });

    const job = await dequeueJob();
    expect(job).not.toBeNull();
    // Raw snake_case row is mapped to the camelCase ProcessingQueue shape.
    expect(job!.id).toBe(jobId);
    expect(job!.jobType).toBe("tender_summary");
    expect(job!.entityType).toBe("tender");
    expect(job!.status).toBe("processing");
    expect(job!.maxAttempts).toBe(3);
    expect(job!.metadata).toEqual({ foo: "bar" });
    expect(job!.startedAt).toBeInstanceOf(Date);
    expect(job!.scheduledAt).toBeInstanceOf(Date);
    expect(job!.createdAt).toBeInstanceOf(Date);
    expect(job!.resultData).toBeNull();
  });

  it("dequeueJob returns null on an empty queue", async () => {
    expect(await dequeueJob()).toBeNull();
  });

  it("never hands the same job to two sequential dequeues", async () => {
    await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(1),
    });

    const first = await dequeueJob();
    const second = await dequeueJob();

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("orders dequeue by priority DESC then scheduled_at ASC", async () => {
    const earlier = new Date(Date.now() - 60_000);
    const later = new Date(Date.now() - 30_000);

    const lowPriority = await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(2),
      priority: 0,
      scheduledAt: earlier,
    });
    const highPriority = await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(3),
      priority: 10,
      scheduledAt: later,
    });
    const highPriorityEarlier = await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(4),
      priority: 10,
      scheduledAt: earlier,
    });

    expect((await dequeueJob())!.id).toBe(highPriorityEarlier);
    expect((await dequeueJob())!.id).toBe(highPriority);
    expect((await dequeueJob())!.id).toBe(lowPriority);
  });

  it("does not dequeue jobs scheduled in the future", async () => {
    await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(5),
      scheduledAt: new Date(Date.now() + 60_000),
    });

    expect(await dequeueJob()).toBeNull();
  });

  it("markJobCompleted persists status and result data", async () => {
    const jobId = await enqueueJob({
      jobType: "company_summary",
      entityType: "company",
      entityId: EID(6),
    });
    await dequeueJob();

    await markJobCompleted(jobId, { summary: "done" });

    const job = await getJob(jobId);
    expect(job!.status).toBe("completed");
    expect(job!.resultData).toEqual({ summary: "done" });
    expect(job!.completedAt).toBeInstanceOf(Date);
  });

  it("markJobFailed below maxAttempts re-queues with backoff; the job is not immediately dequeuable", async () => {
    const jobId = await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(1),
    });
    await dequeueJob();

    await markJobFailed(jobId, "boom");

    const job = await getJob(jobId);
    expect(job!.status).toBe("pending");
    expect(job!.attempts).toBe(1);
    expect(job!.errorMessage).toBe("boom");
    // Exponential backoff pushed scheduled_at into the future…
    expect(job!.scheduledAt!.getTime()).toBeGreaterThan(Date.now());
    // …so an immediate dequeue does not pick it up again.
    expect(await dequeueJob()).toBeNull();
  });

  it("markJobFailed at maxAttempts marks the job failed permanently", async () => {
    const jobId = await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(1),
    });
    // Simulate two prior attempts (maxAttempts defaults to 3).
    await db
      .update(processingQueue)
      .set({ attempts: 2, status: "processing" })
      .where(eq(processingQueue.id, jobId));

    await markJobFailed(jobId, "final failure");

    const job = await getJob(jobId);
    expect(job!.status).toBe("failed");
    expect(job!.attempts).toBe(3);
    expect(job!.errorMessage).toBe("final failure");
    expect(job!.completedAt).toBeInstanceOf(Date);
  });

  it("markJobFailed with shouldRetry=false fails immediately regardless of attempts", async () => {
    const jobId = await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(1),
    });
    await dequeueJob();

    await markJobFailed(jobId, "fatal", false);

    const job = await getJob(jobId);
    expect(job!.status).toBe("failed");
    expect(job!.attempts).toBe(1);
  });

  it("markJobFailed throws for an unknown job", async () => {
    await expect(
      markJobFailed("00000000-0000-4000-8000-00000000dead", "x"),
    ).rejects.toThrow(/Job not found/);
  });

  it("resetStaleProcessingJobs resets only jobs processing for over 15 minutes", async () => {
    const staleId = await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(7),
    });
    const freshId = await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(8),
    });

    await db
      .update(processingQueue)
      .set({
        status: "processing",
        startedAt: new Date(Date.now() - 16 * 60 * 1000),
      })
      .where(eq(processingQueue.id, staleId));
    await db
      .update(processingQueue)
      .set({
        status: "processing",
        startedAt: new Date(Date.now() - 14 * 60 * 1000),
      })
      .where(eq(processingQueue.id, freshId));

    const resetCount = await resetStaleProcessingJobs();

    expect(resetCount).toBe(1);
    expect((await getJob(staleId))!.status).toBe("pending");
    expect((await getJob(staleId))!.startedAt).toBeNull();
    expect((await getJob(freshId))!.status).toBe("processing");
  });

  it("markJobProcessing and resetJobToPending round-trip the claim state", async () => {
    const jobId = await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(1),
    });

    await markJobProcessing(jobId);
    expect((await getJob(jobId))!.status).toBe("processing");

    await resetJobToPending(jobId);
    const job = await getJob(jobId);
    expect(job!.status).toBe("pending");
    expect(job!.startedAt).toBeNull();
  });

  it("getQueueStats counts jobs per status", async () => {
    const a = await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(9),
    });
    await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(10),
    });
    await dequeueJob(); // claims a (older scheduled_at)
    await markJobCompleted(a);

    const stats = await getQueueStats();
    expect(stats).toEqual({
      pending: 1,
      processing: 0,
      completed: 1,
      failed: 0,
    });
  });
});
