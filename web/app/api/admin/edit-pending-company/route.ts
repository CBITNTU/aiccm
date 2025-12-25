import { NextRequest } from "next/server";
import {
  createAdminClient,
  apiResponse,
  apiError,
  getAuthenticatedUser,
  checkSuperadminRole,
} from "@/lib/api";

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

    const supabase = createAdminClient();

    // Verify company exists and is pending_review
    const { data: company, error: fetchError } = await supabase
      .from("companies")
      .select("id, status, company_name")
      .eq("id", companyId)
      .single();

    if (fetchError || !company) {
      return apiError("Company not found", 404);
    }

    if (company.status !== "pending_review") {
      return apiError(
        "Only pending companies can be edited through this endpoint",
        400
      );
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (companyName !== undefined) updateData.company_name = companyName;
    if (companiesHouseNumber !== undefined)
      updateData.companies_house_number = companiesHouseNumber || null;
    if (websiteUrl !== undefined)
      updateData.website_url = websiteUrl || null;
    if (contactPerson !== undefined)
      updateData.contact_person = contactPerson || null;
    if (contactEmail !== undefined)
      updateData.contact_email = contactEmail || null;
    if (contactPhone !== undefined)
      updateData.contact_phone = contactPhone || null;

    // Only update if there are changes
    if (Object.keys(updateData).length === 0) {
      return apiError("No fields to update", 400);
    }

    // Update the company
    const { error: updateError } = await supabase
      .from("companies")
      .update(updateData)
      .eq("id", companyId);

    if (updateError) {
      console.error("Error updating company:", updateError);
      return apiError("Failed to update company", 500);
    }

    return apiResponse<EditPendingCompanyResponse>({
      success: true,
      message: `Company "${company.company_name}" has been updated`,
    });
  } catch (error) {
    console.error("Edit pending company error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
