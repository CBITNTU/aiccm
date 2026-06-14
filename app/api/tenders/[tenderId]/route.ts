import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { tenders, tenderTaxonomies, taxonomies } from "@/lib/db/schema/app";
import { tenderColumnsNoEmbedding } from "@/lib/db/columns";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenderId: string }> },
) {
  try {
    await requireAuth(request);
    const { tenderId } = await params;

    const tenderResult = await db
      .select(tenderColumnsNoEmbedding)
      .from(tenders)
      .where(eq(tenders.id, tenderId))
      .limit(1);

    const tender = tenderResult[0] ?? null;
    if (!tender) {
      return apiResponse({ error: "Tender not found" }, 404);
    }

    // Fetch taxonomies via join
    const taxData = await db
      .select({
        id: taxonomies.id,
        name: taxonomies.name,
      })
      .from(tenderTaxonomies)
      .innerJoin(taxonomies, eq(tenderTaxonomies.taxonomyId, taxonomies.id))
      .where(eq(tenderTaxonomies.tenderId, tenderId));

    return apiResponse({ tender, taxonomies: taxData });
  } catch (error) {
    return handleApiError(error);
  }
}
