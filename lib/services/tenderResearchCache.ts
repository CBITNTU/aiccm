import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { tenders } from "@/lib/db/schema/app";
import { embedTender } from "@/lib/services/embeddingService";
import { generateTenderSummaryAndTaxonomy } from "@/lib/services/tenderAIService";

/**
 * Before deep (LLM) matching, ensure tender-level research is cached on the
 * shared `tenders` row so every user / company benefits — no re-scrape or
 * re-summarise on the next deep run.
 */
export async function ensureTenderResearchCached(
  tenderId: string,
): Promise<{ enriched: boolean; hadSummary: boolean }> {
  const [row] = await db
    .select({
      id: tenders.id,
      aiSummary: tenders.aiSummary,
      summaryGeneratedAt: tenders.summaryGeneratedAt,
    })
    .from(tenders)
    .where(eq(tenders.id, tenderId))
    .limit(1);

  if (!row) {
    throw new Error(`Tender not found: ${tenderId}`);
  }

  const hadSummary = Boolean(row.aiSummary?.trim());
  let enriched = false;

  if (!hadSummary) {
    await generateTenderSummaryAndTaxonomy(tenderId);
    enriched = true;
  }

  try {
    await embedTender(tenderId, { force: enriched });
  } catch (error) {
    console.error(
      `Embedding after tender research cache failed (non-fatal) for ${tenderId}:`,
      error,
    );
  }

  return { enriched, hadSummary };
}
