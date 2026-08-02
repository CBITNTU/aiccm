import { beforeEach, describe, expect, it, vi } from "vitest";

// Same import-safety stubs as tenderMatchingService.test.ts — the module reads
// the DB, AI wrappers and deployment profile at the top level.
const dbMocks = vi.hoisted(() => ({
  where: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const chain: Record<string, unknown> = {
        where: (...args: unknown[]) => dbMocks.where(...args),
      };
      chain.from = vi.fn(() => chain);
      chain.innerJoin = vi.fn(() => chain);
      chain.leftJoin = vi.fn(() => chain);
      return chain;
    }),
  },
}));

vi.mock("@/lib/ai", () => ({
  aiGenerateObject: vi.fn(),
  getMatchingModelFromEnv: vi.fn(() => undefined),
  isOllamaModelId: vi.fn(() => false),
}));

vi.mock("@/lib/services/tenderResearchCache", () => ({
  ensureTenderResearchCached: vi.fn(),
}));

vi.mock("@/lib/platformSettings", () => ({
  getPlatformAISettings: vi.fn(),
}));

vi.mock("@/lib/deployment", () => ({
  getActiveProfile: vi.fn(() => ({
    taxonomyLanguage: "en",
    currency: { code: "GBP", symbol: "£", locale: "en-GB" },
  })),
}));

// batchScoreTendersForCompany dynamically imports "./queueService"; vitest
// resolves that to this same mocked module.
vi.mock("@/lib/services/queueService", () => ({
  enqueueBatch: vi.fn(),
}));

import {
  batchScoreTendersForCompany,
  resolveMatchingJobMetadata,
} from "@/lib/services/tenderMatchingService";
import { getMatchingModelFromEnv } from "@/lib/ai";
import { getPlatformAISettings } from "@/lib/platformSettings";
import { enqueueBatch } from "@/lib/services/queueService";

const COMPANY_ID = "00000000-0000-4000-8000-0000000000c1";
const USER_ID = "00000000-0000-4000-8000-0000000000u1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMatchingModelFromEnv).mockReturnValue(undefined);
  vi.mocked(getPlatformAISettings).mockResolvedValue({
    defaultAiModel: "gpt-5-mini",
    defaultReasoningEffort: "default",
  } as Awaited<ReturnType<typeof getPlatformAISettings>>);
  vi.mocked(enqueueBatch).mockResolvedValue({ batchId: "batch-1", jobIds: [] });
});

describe("resolveMatchingJobMetadata", () => {
  it("uses the platform default model when no env override is set", async () => {
    const { metadata, matchingModel } = await resolveMatchingJobMetadata();

    expect(matchingModel).toBe("gpt-5-mini");
    expect(metadata).toEqual({ model: "gpt-5-mini" });
  });

  it("prefers the MATCHING_MODEL env override", async () => {
    vi.mocked(getMatchingModelFromEnv).mockReturnValue("ollama/llama3");

    const { metadata, matchingModel } = await resolveMatchingJobMetadata();

    expect(matchingModel).toBe("ollama/llama3");
    expect(metadata.model).toBe("ollama/llama3");
  });

  it("includes reasoningEffort only when the platform setting is not 'default'", async () => {
    vi.mocked(getPlatformAISettings).mockResolvedValue({
      defaultAiModel: "gpt-5-mini",
      defaultReasoningEffort: "low",
    } as Awaited<ReturnType<typeof getPlatformAISettings>>);

    const { metadata } = await resolveMatchingJobMetadata();

    expect(metadata).toEqual({ model: "gpt-5-mini", reasoningEffort: "low" });
  });
});

describe("batchScoreTendersForCompany", () => {
  it("queues one tender_matching job per uncached tender", async () => {
    // Single select: cached matching_results lookup → t2 is cached.
    dbMocks.where.mockResolvedValueOnce([{ tenderId: "t2" }]);

    const result = await batchScoreTendersForCompany(
      COMPANY_ID,
      ["t1", "t2", "t3"],
      USER_ID,
    );

    expect(result).toEqual({
      jobCount: 2,
      batchId: "batch-1",
      matchingModel: "gpt-5-mini",
      skippedCount: 1,
      status: "queued",
    });

    expect(enqueueBatch).toHaveBeenCalledWith(
      [
        {
          jobType: "tender_matching",
          entityType: "tender",
          entityId: "t1",
          companyId: COMPANY_ID,
          tenderId: "t1",
          priority: 10,
          metadata: { model: "gpt-5-mini", force: false },
        },
        {
          jobType: "tender_matching",
          entityType: "tender",
          entityId: "t3",
          companyId: COMPANY_ID,
          tenderId: "t3",
          priority: 10,
          metadata: { model: "gpt-5-mini", force: false },
        },
      ],
      "company_matching",
      USER_ID,
      COMPANY_ID,
    );
  });

  it("returns all_cached without enqueuing when every tender is cached", async () => {
    dbMocks.where.mockResolvedValueOnce([
      { tenderId: "t1" },
      { tenderId: "t2" },
    ]);

    const result = await batchScoreTendersForCompany(COMPANY_ID, ["t1", "t2"]);

    expect(result).toEqual({
      jobCount: 0,
      batchId: null,
      matchingModel: "gpt-5-mini",
      skippedCount: 2,
      status: "all_cached",
    });
    expect(enqueueBatch).not.toHaveBeenCalled();
  });

  it("force=true re-queues cached tenders and stamps force in job metadata", async () => {
    dbMocks.where.mockResolvedValueOnce([{ tenderId: "t1" }]);

    const result = await batchScoreTendersForCompany(
      COMPANY_ID,
      ["t1"],
      USER_ID,
      { force: true },
    );

    expect(result.status).toBe("queued");
    expect(result.jobCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    const [jobs] = vi.mocked(enqueueBatch).mock.calls[0];
    expect(jobs[0].metadata).toEqual({ model: "gpt-5-mini", force: true });
  });

  it("falls back to all open/closing_soon tenders when no IDs are given", async () => {
    // First select: open tenders; second select: cached lookup.
    dbMocks.where
      .mockResolvedValueOnce([{ id: "t1" }, { id: "t2" }])
      .mockResolvedValueOnce([]);

    const result = await batchScoreTendersForCompany(COMPANY_ID);

    expect(result.jobCount).toBe(2);
    expect(result.status).toBe("queued");
    const [jobs] = vi.mocked(enqueueBatch).mock.calls[0];
    expect(jobs.map((j) => j.tenderId)).toEqual(["t1", "t2"]);
  });

  it("returns all_cached for an empty tender universe", async () => {
    dbMocks.where.mockResolvedValueOnce([]); // no open tenders
    // cached lookup short-circuits on empty input without a query

    const result = await batchScoreTendersForCompany(COMPANY_ID);

    expect(result).toMatchObject({
      jobCount: 0,
      batchId: null,
      skippedCount: 0,
      status: "all_cached",
    });
    expect(enqueueBatch).not.toHaveBeenCalled();
  });
});
