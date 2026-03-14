import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  isCompanyMember,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyTaxonomies, taxonomies } from "@/lib/db/schema/app";
import { eq, and, inArray } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    await requireAuth(request);
    const { companyId } = await params;

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

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      return apiResponse({ error: "Forbidden" }, 403);
    }

    const body = await request.json();
    const { taxonomyIds }: { taxonomyIds: string[] } = body;

    // Get current taxonomies
    const current = await db
      .select({ taxonomyId: companyTaxonomies.taxonomyId })
      .from(companyTaxonomies)
      .where(eq(companyTaxonomies.companyId, companyId));

    const currentIds = new Set(current.map((ct) => ct.taxonomyId));
    const newIds = new Set(taxonomyIds);

    // Add new ones
    const toAdd = taxonomyIds.filter((id) => !currentIds.has(id));
    if (toAdd.length > 0) {
      await db.insert(companyTaxonomies).values(
        toAdd.map((taxonomyId) => ({ companyId, taxonomyId })),
      );
    }

    // Remove old ones
    const toRemove = Array.from(currentIds).filter((id) => !newIds.has(id));
    if (toRemove.length > 0) {
      await db
        .delete(companyTaxonomies)
        .where(
          and(
            eq(companyTaxonomies.companyId, companyId),
            inArray(companyTaxonomies.taxonomyId, toRemove),
          ),
        );
    }

    return apiResponse({ success: true, taxonomyIds });
  } catch (error) {
    return handleApiError(error);
  }
}
