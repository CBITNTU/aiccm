import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// processJob dispatches to the AI/embedding/matching services — stub them all
// so no real DB or LLM is touched. queueService is only imported for a type,
// so it needs no mock.
vi.mock("@/lib/services/tenderAIService", () => ({
  generateTenderSummary: vi.fn(),
  generateTenderCapabilityTaxonomy: vi.fn(),
  generateTenderSummaryAndTaxonomy: vi.fn(),
}));

vi.mock("@/lib/services/companyAIService", () => ({
  generateCompanySummary: vi.fn(),
  generateCompanyCapabilityTaxonomy: vi.fn(),
}));

vi.mock("@/lib/services/tenderMatchingService", () => ({
  scoreTenderMatch: vi.fn(),
}));

vi.mock("@/lib/services/embeddingService", () => ({
  embedCompany: vi.fn(),
  embedTender: vi.fn(),
  refreshCompanyEmbedding: vi.fn(),
}));

vi.mock("@/lib/services/companyLogoService", () => ({
  discoverCompanyLogo: vi.fn(),
}));

import { processJob } from "@/lib/services/jobProcessor";
import {
  generateTenderSummary,
  generateTenderCapabilityTaxonomy,
  generateTenderSummaryAndTaxonomy,
} from "@/lib/services/tenderAIService";
import {
  generateCompanySummary,
  generateCompanyCapabilityTaxonomy,
} from "@/lib/services/companyAIService";
import { scoreTenderMatch } from "@/lib/services/tenderMatchingService";
import {
  embedCompany,
  embedTender,
  refreshCompanyEmbedding,
} from "@/lib/services/embeddingService";
import { discoverCompanyLogo } from "@/lib/services/companyLogoService";
import type { JobType } from "@/lib/services/queueService";

const tenderSummaryMock = vi.mocked(generateTenderSummary);
const tenderTaxonomyMock = vi.mocked(generateTenderCapabilityTaxonomy);
const tenderBothMock = vi.mocked(generateTenderSummaryAndTaxonomy);
const companySummaryMock = vi.mocked(generateCompanySummary);
const companyTaxonomyMock = vi.mocked(generateCompanyCapabilityTaxonomy);
const scoreTenderMatchMock = vi.mocked(scoreTenderMatch);
const embedCompanyMock = vi.mocked(embedCompany);
const embedTenderMock = vi.mocked(embedTender);
const refreshCompanyEmbeddingMock = vi.mocked(refreshCompanyEmbedding);
const discoverCompanyLogoMock = vi.mocked(discoverCompanyLogo);

function baseJob(overrides: Partial<Parameters<typeof processJob>[0]> = {}) {
  return {
    id: "job-1",
    jobType: "tender_summary" as JobType,
    entityId: "entity-1",
    ...overrides,
  };
}

const matchScore = {
  overallScore: 62,
  capabilityScore: 70,
  experienceScore: 55,
  locationScore: 40,
  certificationScore: 65,
  matchReasons: ["reason"],
  improvementSuggestions: ["suggestion"],
  aiAnalysis: "analysis",
};

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // The tender_matching branch logs [DEBUG] lines; embed failures log errors.
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  vi.resetAllMocks();
});

describe("processJob — tender jobs", () => {
  it("tender_summary calls generateTenderSummary with the entity id", async () => {
    tenderSummaryMock.mockResolvedValue("a summary" as never);

    const result = await processJob(baseJob({ jobType: "tender_summary", entityId: "t-1" }));

    expect(tenderSummaryMock).toHaveBeenCalledWith("t-1");
    expect(result).toEqual({ success: true, summary: "a summary" });
  });

  it("tender_taxonomy calls generateTenderCapabilityTaxonomy with the entity id", async () => {
    tenderTaxonomyMock.mockResolvedValue(["cap-1"] as never);

    const result = await processJob(baseJob({ jobType: "tender_taxonomy", entityId: "t-2" }));

    expect(tenderTaxonomyMock).toHaveBeenCalledWith("t-2");
    expect(result).toEqual({ success: true, taxonomy: ["cap-1"] });
  });

  it("tender_ai_complete generates both and force re-embeds the tender", async () => {
    tenderBothMock.mockResolvedValue({ summary: "s", taxonomy: ["x"] } as never);
    embedTenderMock.mockResolvedValue({ embedded: true } as never);

    const result = await processJob(baseJob({ jobType: "tender_ai_complete", entityId: "t-3" }));

    expect(tenderBothMock).toHaveBeenCalledWith("t-3");
    expect(embedTenderMock).toHaveBeenCalledWith("t-3", { force: true });
    expect(result).toEqual({ success: true, summary: "s", taxonomy: ["x"] });
  });

  it("tender_ai_complete swallows embed failures and still succeeds", async () => {
    tenderBothMock.mockResolvedValue({ summary: "s", taxonomy: ["x"] } as never);
    embedTenderMock.mockRejectedValue(new Error("embed down"));

    const result = await processJob(baseJob({ jobType: "tender_ai_complete", entityId: "t-4" }));

    expect(result).toEqual({ success: true, summary: "s", taxonomy: ["x"] });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Embedding after tender_ai_complete failed (non-fatal) for t-4"),
      expect.any(Error),
    );
  });
});

describe("processJob — company jobs", () => {
  it("company_summary calls generateCompanySummary with the entity id", async () => {
    companySummaryMock.mockResolvedValue("company summary" as never);

    const result = await processJob(baseJob({ jobType: "company_summary", entityId: "c-1" }));

    expect(companySummaryMock).toHaveBeenCalledWith("c-1");
    expect(result).toEqual({ success: true, summary: "company summary" });
  });

  it("company_summary force-refreshes the embedding after writing aiSummary", async () => {
    // aiSummary is the top line of the company embedding source, so this job
    // invalidates the vector — it used to leave it stale.
    companySummaryMock.mockResolvedValue("company summary" as never);

    await processJob(baseJob({ jobType: "company_summary", entityId: "c-1" }));

    expect(refreshCompanyEmbeddingMock).toHaveBeenCalledWith("c-1", { force: true });
    expect(
      companySummaryMock.mock.invocationCallOrder[0],
    ).toBeLessThan(refreshCompanyEmbeddingMock.mock.invocationCallOrder[0]);
  });

  it("company_taxonomy passes fullRegeneration=true from metadata", async () => {
    companyTaxonomyMock.mockResolvedValue(["tx"] as never);

    const result = await processJob(
      baseJob({
        jobType: "company_taxonomy",
        entityId: "c-2",
        metadata: { fullRegeneration: true },
      }),
    );

    expect(companyTaxonomyMock).toHaveBeenCalledWith("c-2", true);
    expect(result).toEqual({ success: true, taxonomy: ["tx"] });
  });

  it("company_taxonomy force-refreshes the embedding", async () => {
    companyTaxonomyMock.mockResolvedValue(["tx"] as never);

    await processJob(baseJob({ jobType: "company_taxonomy", entityId: "c-2" }));

    expect(refreshCompanyEmbeddingMock).toHaveBeenCalledWith("c-2", { force: true });
  });

  it("company_taxonomy defaults fullRegeneration to false when metadata is absent or non-true", async () => {
    companyTaxonomyMock.mockResolvedValue([] as never);

    await processJob(baseJob({ jobType: "company_taxonomy", entityId: "c-3" }));
    expect(companyTaxonomyMock).toHaveBeenLastCalledWith("c-3", false);

    await processJob(
      baseJob({
        jobType: "company_taxonomy",
        entityId: "c-3",
        metadata: { fullRegeneration: "yes" },
      }),
    );
    expect(companyTaxonomyMock).toHaveBeenLastCalledWith("c-3", false);
  });

  it("company_ai_complete runs taxonomy, then summary, then force embed", async () => {
    companyTaxonomyMock.mockResolvedValue(["tx"] as never);
    companySummaryMock.mockResolvedValue("sum" as never);

    const result = await processJob(
      baseJob({
        jobType: "company_ai_complete",
        entityId: "c-4",
        metadata: { fullRegeneration: true },
      }),
    );

    expect(companyTaxonomyMock).toHaveBeenCalledWith("c-4", true);
    expect(companySummaryMock).toHaveBeenCalledWith("c-4");
    expect(refreshCompanyEmbeddingMock).toHaveBeenCalledWith("c-4", { force: true });

    // Ordering: taxonomy → summary → embed
    const taxonomyOrder = companyTaxonomyMock.mock.invocationCallOrder[0];
    const summaryOrder = companySummaryMock.mock.invocationCallOrder[0];
    const embedOrder = refreshCompanyEmbeddingMock.mock.invocationCallOrder[0];
    expect(taxonomyOrder).toBeLessThan(summaryOrder);
    expect(summaryOrder).toBeLessThan(embedOrder);

    expect(result).toEqual({ success: true, summary: "sum", taxonomy: ["tx"] });
  });
});

describe("processJob — compute_embedding", () => {
  it("embeds a company, defaulting force to false", async () => {
    embedCompanyMock.mockResolvedValue({ embedded: true, skipped: false } as never);

    const result = await processJob(
      baseJob({ jobType: "compute_embedding", entityType: "company", entityId: "c-6" }),
    );

    expect(embedCompanyMock).toHaveBeenCalledWith("c-6", { force: false });
    expect(result).toEqual({ success: true, embedded: true, skipped: false });
  });

  it("embeds a tender and forwards metadata.force=true", async () => {
    embedTenderMock.mockResolvedValue({ embedded: true } as never);

    const result = await processJob(
      baseJob({
        jobType: "compute_embedding",
        entityType: "tender",
        entityId: "t-6",
        metadata: { force: true },
      }),
    );

    expect(embedTenderMock).toHaveBeenCalledWith("t-6", { force: true });
    expect(result).toEqual({ success: true, embedded: true });
  });

  it("throws for an unsupported entityType", async () => {
    await expect(
      processJob(
        baseJob({
          id: "job-9",
          jobType: "compute_embedding",
          entityType: "profile",
          entityId: "p-1",
        }),
      ),
    ).rejects.toThrow('compute_embedding: unsupported entityType "profile" for job job-9');
    expect(embedCompanyMock).not.toHaveBeenCalled();
    expect(embedTenderMock).not.toHaveBeenCalled();
  });
});

describe("processJob — tender_matching", () => {
  it("forwards metadata options to scoreTenderMatch", async () => {
    scoreTenderMatchMock.mockResolvedValue(matchScore as never);

    const result = await processJob(
      baseJob({
        jobType: "tender_matching",
        entityId: "t-7",
        companyId: "c-7",
        tenderId: "t-7",
        metadata: {
          demo: true,
          force: true,
          model: "gpt-5-nano",
          batchLabel: "User B",
          reasoningEffort: "low",
        },
      }),
    );

    expect(scoreTenderMatchMock).toHaveBeenCalledWith("c-7", "t-7", {
      demo: true,
      force: true,
      model: "gpt-5-nano",
      batchLabel: "User B",
      reasoningEffort: "low",
    });
    expect(result).toEqual({ success: true, score: matchScore });
  });

  it("passes undefined option fields when metadata is absent", async () => {
    scoreTenderMatchMock.mockResolvedValue(matchScore as never);

    await processJob(
      baseJob({ jobType: "tender_matching", entityId: "t-8", companyId: "c-8", tenderId: "t-8" }),
    );

    expect(scoreTenderMatchMock).toHaveBeenCalledWith("c-8", "t-8", {
      demo: undefined,
      force: undefined,
      model: undefined,
      batchLabel: undefined,
      reasoningEffort: undefined,
    });
  });

  it("throws when companyId is missing", async () => {
    await expect(
      processJob(baseJob({ jobType: "tender_matching", entityId: "t-9", tenderId: "t-9" })),
    ).rejects.toThrow("Company ID and Tender ID required for matching");
    expect(scoreTenderMatchMock).not.toHaveBeenCalled();
  });

  it("throws when tenderId is missing", async () => {
    await expect(
      processJob(baseJob({ jobType: "tender_matching", entityId: "t-9", companyId: "c-9" })),
    ).rejects.toThrow("Company ID and Tender ID required for matching");
    expect(scoreTenderMatchMock).not.toHaveBeenCalled();
  });
});

describe("processJob — unknown job type", () => {
  it("throws for an unknown job type", async () => {
    await expect(
      processJob(baseJob({ jobType: "make_coffee" as JobType })),
    ).rejects.toThrow("Unknown job type: make_coffee");
  });
});

describe("processJob — company_logo", () => {
  it("dispatches to discoverCompanyLogo with the entity id", async () => {
    discoverCompanyLogoMock.mockResolvedValue({ ok: true, logoUrl: "u", errors: [] });

    const result = await processJob(
      baseJob({ jobType: "company_logo", entityType: "company", entityId: "c-1" }),
    );

    expect(discoverCompanyLogoMock).toHaveBeenCalledWith("c-1", { force: false });
    expect(result).toMatchObject({ success: true, ok: true, logoUrl: "u" });
  });

  it("passes force through from job metadata", async () => {
    discoverCompanyLogoMock.mockResolvedValue({ ok: true, errors: [] });

    await processJob(
      baseJob({
        jobType: "company_logo",
        entityType: "company",
        entityId: "c-2",
        metadata: { force: true },
      }),
    );

    expect(discoverCompanyLogoMock).toHaveBeenCalledWith("c-2", { force: true });
  });

  it("succeeds when no logo was found — that is a permanent answer, not a fault", async () => {
    // Retries exist for transient faults. A homepage with no extractable mark
    // must not burn three attempts and land the job in `failed`.
    discoverCompanyLogoMock.mockResolvedValue({
      ok: false,
      reason: "no_candidates",
      errors: [],
    });

    const result = await processJob(
      baseJob({ jobType: "company_logo", entityType: "company", entityId: "c-3" }),
    );

    expect(result).toMatchObject({ success: true, ok: false, reason: "no_candidates" });
  });
});
