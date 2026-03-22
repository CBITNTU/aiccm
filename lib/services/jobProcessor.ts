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
import { type JobType } from "@/lib/services/queueService";

export async function processJob(job: {
  id: string;
  jobType: JobType;
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

    case "tender_ai_complete":
      const { summary: tenderSummary, taxonomy: tenderTaxonomy } =
        await generateTenderSummaryAndTaxonomy(job.entityId);
      return {
        success: true,
        summary: tenderSummary,
        taxonomy: tenderTaxonomy,
      };

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
      return {
        success: true,
        summary: companySummaryText,
        taxonomy: companyTaxonomyIds,
      };
    }

    case "tender_matching": {
      if (!job.companyId || !job.tenderId) {
        throw new Error("Company ID and Tender ID required for matching");
      }
      const meta = (job.metadata ?? {}) as {
        demo?: boolean;
        model?: "gpt-5-nano";
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
