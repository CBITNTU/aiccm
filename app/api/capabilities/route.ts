import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyCapabilitiesRef } from "@/lib/db/schema/app";
import { eq, asc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const data = await db
      .select({
        id: companyCapabilitiesRef.id,
        name: companyCapabilitiesRef.name,
        category: companyCapabilitiesRef.category,
      })
      .from(companyCapabilitiesRef)
      .where(eq(companyCapabilitiesRef.isActive, true))
      .orderBy(asc(companyCapabilitiesRef.category), asc(companyCapabilitiesRef.name));

    return apiResponse({ capabilities: data });
  } catch (error) {
    return handleApiError(error);
  }
}
