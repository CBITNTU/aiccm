import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyStandards, standardsRef } from "@/lib/db/schema/app";
import { eq, and, inArray } from "drizzle-orm";

async function getCompanyStandardsData(companyId: string) {
  return db
    .select({
      id: standardsRef.id,
      name: standardsRef.name,
      parent_id: standardsRef.parentId,
      sort_order: standardsRef.sortOrder,
    })
    .from(companyStandards)
    .innerJoin(standardsRef, eq(companyStandards.standardId, standardsRef.id))
    .where(eq(companyStandards.companyId, companyId));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    const data = await getCompanyStandardsData(companyId);
    return apiResponse({ standards: data });
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
      throw new AuthError("No access to this company");
    }

    const body = await request.json();
    const { standardIds } = body as { standardIds: string[] };

    const current = await db
      .select({ standardId: companyStandards.standardId })
      .from(companyStandards)
      .where(eq(companyStandards.companyId, companyId));

    const currentIds = new Set(current.map((c) => c.standardId));
    const newIds = new Set(standardIds);

    const toRemove = [...currentIds].filter((id) => !newIds.has(id));
    const toAdd = [...newIds].filter((id) => !currentIds.has(id));

    if (toRemove.length > 0) {
      await db
        .delete(companyStandards)
        .where(
          and(
            eq(companyStandards.companyId, companyId),
            inArray(companyStandards.standardId, toRemove),
          ),
        );
    }

    if (toAdd.length > 0) {
      await db.insert(companyStandards).values(
        toAdd.map((standardId) => ({
          companyId,
          standardId,
        })),
      );
    }

    const data = await getCompanyStandardsData(companyId);
    return apiResponse({ standards: data });
  } catch (error) {
    return handleApiError(error);
  }
}
