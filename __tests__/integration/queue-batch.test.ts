import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { companies, processingQueue } from "@/lib/db/schema/app";
import { incrementBatchProgress } from "@/lib/db/raw";
import {
  cancelBatch,
  dequeueJob,
  enqueueBatch,
  enqueueJob,
  getActiveMatchingBatchForCompany,
  getBatchStatus,
  markJobCompleted,
  markJobFailed,
  reconcileBatch,
  type EnqueueJobOptions,
} from "@/lib/services/queueService";
import { resetDb } from "../helpers/dbReset";

const EID = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function tenderJob(n: number): EnqueueJobOptions {
  return {
    jobType: "tender_matching",
    entityType: "tender",
    entityId: EID(n),
    priority: 10,
  };
}

async function seedCompany(): Promise<string> {
  const [u] = await db
    .insert(user)
    .values({ name: "Queue Owner", email: "queue-owner@example.com" })
    .returning({ id: user.id });
  const [company] = await db
    .insert(companies)
    .values({ userId: u.id, companyName: "Queue Test Ltd" })
    .returning({ id: companies.id });
  return company.id;
}

describe("queue batches (real database)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("enqueueBatch creates a processing batch with linked pending jobs", async () => {
    const { batchId, jobIds } = await enqueueBatch(
      [tenderJob(1), tenderJob(2), tenderJob(3)],
      "company_matching",
    );

    expect(jobIds).toHaveLength(3);

    const batch = await getBatchStatus(batchId);
    expect(batch).toMatchObject({
      id: batchId,
      batchType: "company_matching",
      totalJobs: 3,
      completedJobs: 0,
      failedJobs: 0,
      status: "processing",
    });

    const jobs = await db
      .select()
      .from(processingQueue)
      .where(eq(processingQueue.batchId, batchId));
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.status === "pending")).toBe(true);
  });

  it("prefers batch jobs over older non-batch jobs when dequeuing", async () => {
    // Non-batch job first, with a higher priority and earlier schedule.
    await enqueueJob({
      jobType: "tender_summary",
      entityType: "tender",
      entityId: EID(99),
      priority: 100,
      scheduledAt: new Date(Date.now() - 60_000),
    });
    const { jobIds } = await enqueueBatch([tenderJob(1)], "company_matching");

    const first = await dequeueJob();
    expect(first!.id).toBe(jobIds[0]); // batch job wins despite lower priority
  });

  it("completes the batch when every job completes", async () => {
    const { batchId } = await enqueueBatch(
      [tenderJob(1), tenderJob(2)],
      "company_matching",
    );

    for (let i = 0; i < 2; i++) {
      const job = await dequeueJob();
      await markJobCompleted(job!.id, { ok: true });
    }

    const batch = await getBatchStatus(batchId);
    expect(batch).toMatchObject({
      completedJobs: 2,
      failedJobs: 0,
      status: "completed",
    });
  });

  it("a mixed outcome still completes the batch and counts the failure", async () => {
    const { batchId } = await enqueueBatch(
      [tenderJob(1), tenderJob(2)],
      "company_matching",
    );

    const first = await dequeueJob();
    await markJobCompleted(first!.id);
    const second = await dequeueJob();
    await markJobFailed(second!.id, "llm exploded", false);

    const batch = await getBatchStatus(batchId);
    expect(batch).toMatchObject({
      completedJobs: 1,
      failedJobs: 1,
      status: "completed",
    });
  });

  it("marks the batch failed when every job fails", async () => {
    const { batchId } = await enqueueBatch(
      [tenderJob(1), tenderJob(2)],
      "company_matching",
    );

    for (let i = 0; i < 2; i++) {
      const job = await dequeueJob();
      await markJobFailed(job!.id, "boom", false);
    }

    const batch = await getBatchStatus(batchId);
    expect(batch).toMatchObject({
      completedJobs: 0,
      failedJobs: 2,
      status: "failed",
    });
  });

  it("cancelBatch deletes pending jobs, fails in-flight ones, and is idempotent", async () => {
    const { batchId } = await enqueueBatch(
      [tenderJob(1), tenderJob(2), tenderJob(3)],
      "company_matching",
    );
    const inFlight = await dequeueJob();

    const result = await cancelBatch(batchId);
    expect(result).toEqual({
      cancelled: true,
      status: "cancelled",
      deletedPending: 2,
      cancelledInFlight: 1,
    });

    // Pending jobs are gone; the in-flight one is failed with the cancel marker.
    const remaining = await db
      .select()
      .from(processingQueue)
      .where(eq(processingQueue.batchId, batchId));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(inFlight!.id);
    expect(remaining[0].status).toBe("failed");
    expect(remaining[0].errorMessage).toBe("Cancelled by user");

    // Nothing left to dequeue from this batch.
    expect(await dequeueJob()).toBeNull();

    // Second cancel is a converging no-op.
    const second = await cancelBatch(batchId);
    expect(second).toEqual({
      cancelled: false,
      status: "cancelled",
      deletedPending: 0,
      cancelledInFlight: 0,
    });
  });

  it("cancelBatch on an unknown batch reports null status", async () => {
    const result = await cancelBatch(EID(42));
    expect(result).toEqual({
      cancelled: false,
      status: null,
      deletedPending: 0,
      cancelledInFlight: 0,
    });
  });

  it("a late completion cannot un-cancel a batch (terminal status preserved)", async () => {
    const { batchId } = await enqueueBatch(
      [tenderJob(1), tenderJob(2)],
      "company_matching",
    );
    await dequeueJob();
    await cancelBatch(batchId);

    // The straggler worker reports its outcome after cancellation.
    const result = await incrementBatchProgress(batchId, "completed");

    expect(result!.status).toBe("cancelled");
    expect(result!.completedJobs).toBe(1); // counter still increments
    expect((await getBatchStatus(batchId))!.status).toBe("cancelled");
  });

  it("reconcileBatch resolves a drifted batch from queue reality", async () => {
    const { batchId, jobIds } = await enqueueBatch(
      [tenderJob(1), tenderJob(2)],
      "company_matching",
    );
    // Simulate drift: jobs finished but batch counters never moved.
    await db
      .update(processingQueue)
      .set({ status: "completed" })
      .where(inArray(processingQueue.id, jobIds));

    const reconciled = await reconcileBatch(batchId);

    expect(reconciled).toMatchObject({
      completedJobs: 2,
      failedJobs: 0,
      status: "completed",
    });
    expect((await getBatchStatus(batchId))!.status).toBe("completed");
  });

  it("reconcileBatch marks the batch failed when every drifted job failed", async () => {
    const { batchId, jobIds } = await enqueueBatch(
      [tenderJob(1), tenderJob(2)],
      "company_matching",
    );
    await db
      .update(processingQueue)
      .set({ status: "failed" })
      .where(inArray(processingQueue.id, jobIds));

    const reconciled = await reconcileBatch(batchId);
    expect(reconciled!.status).toBe("failed");
    expect(reconciled!.failedJobs).toBe(2);
  });

  it("reconcileBatch leaves a batch with live jobs untouched", async () => {
    const { batchId, jobIds } = await enqueueBatch(
      [tenderJob(1), tenderJob(2)],
      "company_matching",
    );
    await db
      .update(processingQueue)
      .set({ status: "completed" })
      .where(eq(processingQueue.id, jobIds[0]));

    const reconciled = await reconcileBatch(batchId);

    expect(reconciled!.status).toBe("processing");
    expect((await getBatchStatus(batchId))!.completedJobs).toBe(0);
  });

  describe("getActiveMatchingBatchForCompany", () => {
    it("returns the in-flight tender_matching batch for the company", async () => {
      const companyId = await seedCompany();
      const { batchId } = await enqueueBatch(
        [tenderJob(1)],
        "tender_matching",
        undefined,
        companyId,
      );

      const active = await getActiveMatchingBatchForCompany(companyId);
      expect(active).not.toBeNull();
      expect(active!.id).toBe(batchId);
      expect(active!.status).toBe("processing");
    });

    it("ignores cancelled batches and other companies", async () => {
      const companyId = await seedCompany();
      const { batchId } = await enqueueBatch(
        [tenderJob(1)],
        "tender_matching",
        undefined,
        companyId,
      );
      await cancelBatch(batchId);

      expect(await getActiveMatchingBatchForCompany(companyId)).toBeNull();
      expect(await getActiveMatchingBatchForCompany(EID(77))).toBeNull();
    });

    it("reconciles a drifted batch and reports it as no longer active", async () => {
      const companyId = await seedCompany();
      const { batchId, jobIds } = await enqueueBatch(
        [tenderJob(1)],
        "tender_matching",
        undefined,
        companyId,
      );
      await db
        .update(processingQueue)
        .set({ status: "completed" })
        .where(
          and(
            eq(processingQueue.id, jobIds[0]),
            eq(processingQueue.batchId, batchId),
          ),
        );

      expect(await getActiveMatchingBatchForCompany(companyId)).toBeNull();
      expect((await getBatchStatus(batchId))!.status).toBe("completed");
    });
  });
});
