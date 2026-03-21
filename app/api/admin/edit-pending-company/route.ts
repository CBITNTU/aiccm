import { NextRequest } from "next/server";
import {
  apiResponse,
  apiError,
  getAuthenticatedUser,
  checkSuperadminRole,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

export interface EditPendingCompanyRequest {
  companyId: string;
  companyName?: string;
  companiesHouseNumber?: string;
  websiteUrl?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface EditPendingCompanyResponse {
  success: boolean;
  message: string;
}

export async function PUT(request: NextRequest) {
  try {
    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(authError || "Unauthorized", 401);
    }

    // Check superadmin role
    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    const body: EditPendingCompanyRequest = await request.json();
    const {
      companyId,
      companyName,
      companiesHouseNumber,
      websiteUrl,
      contactPerson,
      contactEmail,
      contactPhone,
    } = body;

    if (!companyId) {
      return apiError("Company ID is required", 400);
    }

    // Verify company exists and is pending_review
    const companyRows = await db
      .select({
        id: companies.id,
        status: companies.status,
        companyName: companies.companyName,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const company = companyRows[0];

    if (!company) {
      return apiError("Company not found", 404);
    }

    if (company.status !== "pending_review") {
      return apiError(
        "Only pending companies can be edited through this endpoint",
        400,
      );
    }

    // Build update object with only provided fields
    const updateData: Partial<typeof companies.$inferInsert> = {};
    if (companyName !== undefined) updateData.companyName = companyName;
    if (companiesHouseNumber !== undefined)
      updateData.companiesHouseNumber = companiesHouseNumber || null;
    if (websiteUrl !== undefined) updateData.websiteUrl = websiteUrl || null;
    if (contactPerson !== undefined)
      updateData.contactPerson = contactPerson || null;
    if (contactEmail !== undefined)
      updateData.contactEmail = contactEmail || null;
    if (contactPhone !== undefined)
      updateData.contactPhone = contactPhone || null;

    // Only update if there are changes
    if (Object.keys(updateData).length === 0) {
      return apiError("No fields to update", 400);
    }

    // Update the company
    await db
      .update(companies)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(companies.id, companyId));

    await logApiEvent(request, {
      actionType: "admin_edit_pending_company",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: companyId,
      details: {
        company_name: company.companyName,
        fields_updated: Object.keys(updateData),
      },
    }).catch(() => {});

    return apiResponse<EditPendingCompanyResponse>({
      success: true,
      message: `Company "${company.companyName}" has been updated`,
    });
  } catch (error) {
    console.error("Edit pending company error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
