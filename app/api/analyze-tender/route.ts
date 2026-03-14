import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { tenderTaxonomySuggestionSchema } from "@/lib/schemas/tenderTaxonomy";
import { logApiEvent } from "@/lib/services/eventLogger";
import { z } from "zod";
import {
  requireAuth,
  validateBody,
  handleApiError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { tenders, taxonomies, tenderTaxonomies } from "@/lib/db/schema/app";
import { eq, asc } from "drizzle-orm";

const analyzeTenderInputSchema = z.object({
  tenderData: z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(10000).optional(),
    buyer: z.string().max(500),
    cpv_codes: z.array(z.string()).optional(),
    location: z.string().max(200).optional(),
  }),
  tenderId: z.string().uuid().optional(),
});

function buildTenderAnalysisPrompt(
  tenderData: z.infer<typeof analyzeTenderInputSchema>["tenderData"],
  taxonomyList: string,
): string {
  return `Tender Title: ${tenderData.title}
Description: ${tenderData.description || "Not provided"}
Buyer: ${tenderData.buyer}
${tenderData.cpv_codes ? `CPV Codes: ${tenderData.cpv_codes.join(", ")}` : ""}
${tenderData.location ? `Location: ${tenderData.location}` : ""}

Available taxonomy categories: ${taxonomyList}

Pick 2-5 categories that best match this tender. Focus on the most specific categories.`;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const { tenderData, tenderId } = await validateBody(
      request,
      analyzeTenderInputSchema,
    );

    // If tenderId provided, verify tender exists
    if (tenderId) {
      const tenderRows = await db
        .select({ id: tenders.id })
        .from(tenders)
        .where(eq(tenders.id, tenderId))
        .limit(1);

      if (!tenderRows[0]) {
        return apiResponse({ error: "Tender not found" }, 404);
      }
    }

    // Fetch available taxonomies
    const taxonomyRows = await db
      .select({ id: taxonomies.id, name: taxonomies.name, level: taxonomies.level })
      .from(taxonomies)
      .orderBy(asc(taxonomies.level));

    const taxonomyList =
      taxonomyRows.map((t) => `${t.name} (Level ${t.level})`).join(", ") || "";

    const prompt = buildTenderAnalysisPrompt(tenderData, taxonomyList);

    const parsed = await aiGenerateObject({
      schema: tenderTaxonomySuggestionSchema,
      system:
        "You are an expert at analyzing tender documents and categorizing them.",
      prompt,
      temperature: 0.2,
      maxTokens: 10000,
    });

    const suggestedTaxonomies = parsed.taxonomies;

    // Auto-tag tender if tenderId provided
    if (tenderId && suggestedTaxonomies.length > 0 && taxonomyRows.length > 0) {
      const taxonomyIds = taxonomyRows
        .filter((t) =>
          suggestedTaxonomies.some(
            (suggested) =>
              t.name.toLowerCase().includes(suggested.toLowerCase()) ||
              suggested.toLowerCase().includes(t.name.toLowerCase()),
          ),
        )
        .map((t) => t.id);

      if (taxonomyIds.length > 0) {
        await db
          .delete(tenderTaxonomies)
          .where(eq(tenderTaxonomies.tenderId, tenderId));

        const taxonomyInserts = taxonomyIds.map((taxId) => ({
          tenderId: tenderId,
          taxonomyId: taxId,
        }));

        await db.insert(tenderTaxonomies).values(taxonomyInserts);
      }
    }

    await logApiEvent(request, {
      actionType: "tender_analyzed",
      userId: user.id,
      entityType: "tender",
      entityId: tenderId || undefined,
      details: {
        title: tenderData.title,
        taxonomyCount: suggestedTaxonomies.length,
      },
    }).catch(() => {});

    return apiResponse({
      suggestedTaxonomies,
      taxonomyCount: suggestedTaxonomies.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
