import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyCapabilities, companyCapabilitiesRef } from "@/lib/db/schema/app";
import { eq, and, inArray, asc } from "drizzle-orm";

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

    // Fetch company's current capabilities via join
    const capData = await db
      .select({
        id: companyCapabilitiesRef.id,
        name: companyCapabilitiesRef.name,
        category: companyCapabilitiesRef.category,
      })
      .from(companyCapabilities)
      .innerJoin(
        companyCapabilitiesRef,
        eq(companyCapabilities.capabilityId, companyCapabilitiesRef.id),
      )
      .where(eq(companyCapabilities.companyId, companyId));

    // Fetch all available capabilities
    const allCapabilities = await db
      .select({
        id: companyCapabilitiesRef.id,
        name: companyCapabilitiesRef.name,
        category: companyCapabilitiesRef.category,
      })
      .from(companyCapabilitiesRef)
      .where(eq(companyCapabilitiesRef.isActive, true))
      .orderBy(asc(companyCapabilitiesRef.category), asc(companyCapabilitiesRef.name));

    return apiResponse({
      capabilities: capData,
      allCapabilities,
    });
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
    const { capabilityIds } = body as { capabilityIds: string[] };

    if (!Array.isArray(capabilityIds) || capabilityIds.length > 500) {
      return apiResponse({ error: "capabilityIds must be an array with at most 500 items" }, 400);
    }

    // Get current capability IDs
    const current = await db
      .select({ capabilityId: companyCapabilities.capabilityId })
      .from(companyCapabilities)
      .where(eq(companyCapabilities.companyId, companyId));

    const currentIds = new Set(current.map((c) => c.capabilityId));
    const newIds = new Set(capabilityIds);

    // Determine diff
    const toRemove = [...currentIds].filter((id) => !newIds.has(id));
    const toAdd = [...newIds].filter((id) => !currentIds.has(id));

    // Apply removals
    if (toRemove.length > 0) {
      await db
        .delete(companyCapabilities)
        .where(
          and(
            eq(companyCapabilities.companyId, companyId),
            inArray(companyCapabilities.capabilityId, toRemove),
          ),
        );
    }

    // Apply additions
    if (toAdd.length > 0) {
      await db.insert(companyCapabilities).values(
        toAdd.map((capabilityId) => ({
          companyId,
          capabilityId,
        })),
      );
    }

    // Fetch updated capabilities via join
    const updatedCaps = await db
      .select({
        id: companyCapabilitiesRef.id,
        name: companyCapabilitiesRef.name,
        category: companyCapabilitiesRef.category,
      })
      .from(companyCapabilities)
      .innerJoin(
        companyCapabilitiesRef,
        eq(companyCapabilities.capabilityId, companyCapabilitiesRef.id),
      )
      .where(eq(companyCapabilities.companyId, companyId));

    return apiResponse({ capabilities: updatedCaps });
  } catch (error) {
    return handleApiError(error);
  }
}
