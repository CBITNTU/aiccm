import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";

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

    const supabase = createAdminClient();

    // Fetch company's current capabilities
    const { data: companyCapabilities, error: ccError } = await supabase
      .from("company_capabilities")
      .select("company_capabilities_ref(id, name, category)")
      .eq("company_id", companyId);

    if (ccError) throw ccError;

    const capabilities = (companyCapabilities || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cc: any) => cc.company_capabilities_ref)
      .filter(Boolean);

    // Fetch all available capabilities
    const { data: allCapabilities, error: allError } = await supabase
      .from("company_capabilities_ref")
      .select("id, name, category")
      .eq("is_active", true)
      .order("category")
      .order("name");

    if (allError) throw allError;

    return apiResponse({
      capabilities,
      allCapabilities: allCapabilities || [],
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

    const supabase = createAdminClient();
    const body = await request.json();
    const { capabilityIds } = body as { capabilityIds: string[] };

    // Get current capability IDs
    const { data: current } = await supabase
      .from("company_capabilities")
      .select("capability_id")
      .eq("company_id", companyId);

    const currentIds = new Set((current || []).map((c) => c.capability_id));
    const newIds = new Set(capabilityIds);

    // Determine diff
    const toRemove = [...currentIds].filter((id) => !newIds.has(id));
    const toAdd = [...newIds].filter((id) => !currentIds.has(id));

    // Apply removals
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("company_capabilities")
        .delete()
        .eq("company_id", companyId)
        .in("capability_id", toRemove);
      if (error) throw error;
    }

    // Apply additions
    if (toAdd.length > 0) {
      const inserts = toAdd.map((capabilityId) => ({
        company_id: companyId,
        capability_id: capabilityId,
      }));
      const { error } = await supabase
        .from("company_capabilities")
        .insert(inserts);
      if (error) throw error;
    }

    // Fetch updated capabilities
    const { data: updated } = await supabase
      .from("company_capabilities")
      .select("company_capabilities_ref(id, name, category)")
      .eq("company_id", companyId);

    const capabilities = (updated || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cc: any) => cc.company_capabilities_ref)
      .filter(Boolean);

    return apiResponse({ capabilities });
  } catch (error) {
    return handleApiError(error);
  }
}
