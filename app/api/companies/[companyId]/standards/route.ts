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

    const { data: companyStandards, error } = await supabase
      .from("company_standards")
      .select("standards_ref(id, name, parent_id, sort_order)")
      .eq("company_id", companyId);

    if (error) throw error;

    const standards = (companyStandards || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cs: any) => cs.standards_ref)
      .filter(Boolean);

    return apiResponse({ standards });
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
    const { standardIds } = body as { standardIds: string[] };

    const { data: current } = await supabase
      .from("company_standards")
      .select("standard_id")
      .eq("company_id", companyId);

    const currentIds = new Set((current || []).map((c) => c.standard_id));
    const newIds = new Set(standardIds);

    const toRemove = [...currentIds].filter((id) => !newIds.has(id));
    const toAdd = [...newIds].filter((id) => !currentIds.has(id));

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("company_standards")
        .delete()
        .eq("company_id", companyId)
        .in("standard_id", toRemove);
      if (error) throw error;
    }

    if (toAdd.length > 0) {
      const inserts = toAdd.map((standardId) => ({
        company_id: companyId,
        standard_id: standardId,
      }));
      const { error } = await supabase
        .from("company_standards")
        .insert(inserts);
      if (error) throw error;
    }

    const { data: updated } = await supabase
      .from("company_standards")
      .select("standards_ref(id, name, parent_id, sort_order)")
      .eq("company_id", companyId);

    const standards = (updated || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cs: any) => cs.standards_ref)
      .filter(Boolean);

    return apiResponse({ standards });
  } catch (error) {
    return handleApiError(error);
  }
}
