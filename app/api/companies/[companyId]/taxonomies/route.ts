import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  isCompanyMember,
} from "@/lib/api/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    await requireAuth(request);
    const { companyId } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("company_taxonomies")
      .select("taxonomy_id, taxonomies(id, name)")
      .eq("company_id", companyId);

    if (error) throw error;

    const taxonomies = (data || [])
      .map((ct) => ({
        id:
          (ct.taxonomies as { id: string; name: string } | null)?.id || "",
        name:
          (ct.taxonomies as { id: string; name: string } | null)?.name || "",
      }))
      .filter((t) => t.name);

    return apiResponse({ taxonomies });
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

    const supabase = createAdminClient();
    const body = await request.json();
    const { taxonomyIds }: { taxonomyIds: string[] } = body;

    // Get current taxonomies
    const { data: current } = await supabase
      .from("company_taxonomies")
      .select("taxonomy_id")
      .eq("company_id", companyId);

    const currentIds = new Set(current?.map((ct) => ct.taxonomy_id) || []);
    const newIds = new Set(taxonomyIds);

    // Add new ones
    const toAdd = taxonomyIds.filter((id) => !currentIds.has(id));
    if (toAdd.length > 0) {
      const { error: addError } = await supabase
        .from("company_taxonomies")
        .insert(
          toAdd.map((taxonomy_id) => ({ company_id: companyId, taxonomy_id })),
        );
      if (addError) throw addError;
    }

    // Remove old ones
    const toRemove = Array.from(currentIds).filter((id) => !newIds.has(id));
    if (toRemove.length > 0) {
      const { error: removeError } = await supabase
        .from("company_taxonomies")
        .delete()
        .eq("company_id", companyId)
        .in("taxonomy_id", toRemove);
      if (removeError) throw removeError;
    }

    return apiResponse({ success: true, taxonomyIds });
  } catch (error) {
    return handleApiError(error);
  }
}
