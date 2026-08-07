import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import {
  requireCompanyAccess,
  markCompanyAdminPrepared,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { companyTaxonomies, taxonomies } from "@/lib/db/schema/app";
import { refreshCompanyEmbedding } from "@/lib/services/embeddingService";
import { eq, and, inArray } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    await requireCompanyAccess(user.id, companyId);

    const taxData = await db
      .select({
        id: taxonomies.id,
        name: taxonomies.name,
      })
      .from(companyTaxonomies)
      .innerJoin(taxonomies, eq(companyTaxonomies.taxonomyId, taxonomies.id))
      .where(eq(companyTaxonomies.companyId, companyId));

    const filteredTaxonomies = taxData.filter((t) => t.name);

    return apiResponse({ taxonomies: filteredTaxonomies });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const access = await requireCompanyAccess(user.id, companyId);
    // Must be in this frame — see enableEmailSuppression's contract.
    suppressEmailForAdminOverride(access, user.id);

    const body = await request.json();
    const { taxonomyIds }: { taxonomyIds: string[] } = body;

    if (!Array.isArray(taxonomyIds) || taxonomyIds.length > 500) {
      return apiResponse({ error: "taxonomyIds must be an array with at most 500 items" }, 400);
    }

    // Get current taxonomies
    const current = await db
      .select({ taxonomyId: companyTaxonomies.taxonomyId })
      .from(companyTaxonomies)
      .where(eq(companyTaxonomies.companyId, companyId));

    const currentIds = new Set(current.map((ct) => ct.taxonomyId));
    const newIds = new Set(taxonomyIds);

    // Add new ones
    const toAdd = taxonomyIds.filter((id) => !currentIds.has(id));

    // Remove old ones
    const toRemove = Array.from(currentIds).filter((id) => !newIds.has(id));
    await db.transaction(async (tx) => {
      if (toAdd.length > 0) {
        await tx.insert(companyTaxonomies).values(
          toAdd.map((taxonomyId) => ({ companyId, taxonomyId })),
        );
      }

      if (toRemove.length > 0) {
        await tx
          .delete(companyTaxonomies)
          .where(
            and(
              eq(companyTaxonomies.companyId, companyId),
              inArray(companyTaxonomies.taxonomyId, toRemove),
            ),
          );
      }
    });

    // Unlike capabilities/markets/standards, taxonomies have no review queue
    // and no verification-tier limit — they always write straight through — so
    // `adminOverride` only suppresses email and records the curation.
    if (access.adminOverride && (toAdd.length > 0 || toRemove.length > 0)) {
      await markCompanyAdminPrepared(companyId, user.id);
    }

    // Taxonomy names feed the embedding source — see refreshCompanyEmbedding.
    if (toAdd.length > 0 || toRemove.length > 0) {
      await refreshCompanyEmbedding(companyId);
    }

    return apiResponse({ success: true, taxonomyIds });
  } catch (error) {
    return handleApiError(error);
  }
}
