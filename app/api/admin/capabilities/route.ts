import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyCapabilitiesRef } from "@/lib/db/schema/app";
import { asc } from "drizzle-orm";
import { invalidateCapabilityCatalog } from "@/lib/services/capabilityCatalog";
import {
  localizedName,
  localizedCategory,
  localizeCapabilityWrite,
} from "@/lib/taxonomy/localizedName";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    // Fetch all capabilities ordered by category then name, surfacing the
    // locale-appropriate name/category for the active deployment profile.
    const allCapabilities = await db
      .select({
        id: companyCapabilitiesRef.id,
        name: localizedName(
          companyCapabilitiesRef.name,
          companyCapabilitiesRef.nameZh,
        ),
        category: localizedCategory(
          companyCapabilitiesRef.category,
          companyCapabilitiesRef.categoryZh,
        ),
        parentId: companyCapabilitiesRef.parentId,
      })
      .from(companyCapabilitiesRef)
      .orderBy(asc(companyCapabilitiesRef.category), asc(companyCapabilitiesRef.name));

    return apiResponse({ capabilities: allCapabilities });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const body = await request.json();

    const result = await db
      .insert(companyCapabilitiesRef)
      .values(localizeCapabilityWrite(body, { create: true }))
      .returning();

    invalidateCapabilityCatalog();

    return apiResponse({ capability: result[0] });
  } catch (error) {
    return handleApiError(error);
  }
}
