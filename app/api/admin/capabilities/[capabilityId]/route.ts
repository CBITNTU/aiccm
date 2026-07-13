import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyCapabilitiesRef } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";
import { invalidateCapabilityCatalog } from "@/lib/services/capabilityCatalog";
import { localizeCapabilityWrite } from "@/lib/taxonomy/localizedName";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ capabilityId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { capabilityId } = await params;
    const body = await request.json();

    const result = await db
      .update(companyCapabilitiesRef)
      .set(localizeCapabilityWrite(body, { create: false }))
      .where(eq(companyCapabilitiesRef.id, capabilityId))
      .returning();

    if (result.length === 0) {
      throw new Error("Capability not found");
    }

    invalidateCapabilityCatalog();

    return apiResponse({ capability: result[0] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ capabilityId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { capabilityId } = await params;

    await db
      .delete(companyCapabilitiesRef)
      .where(eq(companyCapabilitiesRef.id, capabilityId));

    invalidateCapabilityCatalog();

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
