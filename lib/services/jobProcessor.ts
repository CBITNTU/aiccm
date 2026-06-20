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
import { embedCompany, embedTender } from "@/lib/services/embeddingService";
import { type JobType } from "@/lib/services/queueService";

export async function processJob(job: {
  id: string;
  jobType: JobType;
  entityType?: "company" | "tender" | string | null;
  entityId: string;
  companyId?: string | null;
  tenderId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  switch (job.jobType) {
    case "tender_summary":
      const summary = await generateTenderSummary(job.entityId);
      return { success: true, summary };

    case "tender_taxonomy":
      const taxonomy = await generateTenderCapabilityTaxonomy(job.entityId);
      return { success: true, taxonomy };

    case "tender_ai_complete": {
      const { summary: tenderSummary, taxonomy: tenderTaxonomy } =
        await generateTenderSummaryAndTaxonomy(job.entityId);
      // Re-embed from the freshly generated summary/taxonomy. force: true
      // because the source just changed, so the source-hash dedupe would
      // otherwise skip it. Mirrors company_ai_complete; non-fatal.
      try {
        await embedTender(job.entityId, { force: true });
      } catch (embedError) {
        console.error(
          `Embedding after tender_ai_complete failed (non-fatal) for ${job.entityId}:`,
          embedError,
        );
      }
      return {
        success: true,
        summary: tenderSummary,
        taxonomy: tenderTaxonomy,
      };
    }

    case "company_summary":
      const companySummary = await generateCompanySummary(job.entityId);
      return { success: true, summary: companySummary };

    case "company_taxonomy":
      const fullRegeneration = job.metadata?.fullRegeneration === true;
      const companyTaxonomy = await generateCompanyCapabilityTaxonomy(
        job.entityId,
        fullRegeneration,
      );
      return { success: true, taxonomy: companyTaxonomy };

    case "company_ai_complete": {
      const fullRegen = job.metadata?.fullRegeneration === true;
      // Local keyword taxonomy first (no AI, reliable), then AI summary
      const companyTaxonomyIds = await generateCompanyCapabilityTaxonomy(job.entityId, fullRegen);
      const companySummaryText = await generateCompanySummary(job.entityId);
      try {
        await embedCompany(job.entityId, { force: true });
      } catch (embedError) {
        console.error(
          `Embedding after company_ai_complete failed (non-fatal) for ${job.entityId}:`,
          embedError,
        );
      }
      return {
        success: true,
        summary: companySummaryText,
        taxonomy: companyTaxonomyIds,
      };
    }

    case "compute_embedding": {
      const meta = (job.metadata ?? {}) as { force?: boolean };
      const force = meta.force === true;
      if (job.entityType === "company") {
        const result = await embedCompany(job.entityId, { force });
        return { success: true, ...result };
      }
      if (job.entityType === "tender") {
        const result = await embedTender(job.entityId, { force });
        return { success: true, ...result };
      }
      throw new Error(
        `compute_embedding: unsupported entityType "${job.entityType}" for job ${job.id}`,
      );
    }

    case "tender_matching": {
      if (!job.companyId || !job.tenderId) {
        throw new Error("Company ID and Tender ID required for matching");
      }
      const meta = (job.metadata ?? {}) as {
        demo?: boolean;
        force?: boolean;
        model?: string;
        batchLabel?: string;
        reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
      };
      console.log("[DEBUG] tender_matching job:", {
        jobId: job.id,
        companyId: job.companyId,
        tenderId: job.tenderId,
        meta,
      });
      const score = await scoreTenderMatch(job.companyId, job.tenderId, {
        demo: meta.demo,
        force: meta.force,
        model: meta.model,
        batchLabel: meta.batchLabel,
        reasoningEffort: meta.reasoningEffort,
      });
      console.log("[DEBUG] tender_matching result:", {
        jobId: job.id,
        overall: score.overallScore,
        capability: score.capabilityScore,
        experience: score.experienceScore,
        certification: score.certificationScore,
        location: score.locationScore,
      });
      return { success: true, score };
    }

    default:
      throw new Error(`Unknown job type: ${job.jobType}`);
  }
}
