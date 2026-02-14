import { NextRequest } from "next/server";
import { apiResponse, createAdminClient, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ capabilityId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { capabilityId } = await params;
    const supabase = createAdminClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from("company_capabilities_ref")
      .update(body)
      .eq("id", capabilityId)
      .select()
      .single();

    if (error) throw error;

    return apiResponse({ capability: data });
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
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("company_capabilities_ref")
      .delete()
      .eq("id", capabilityId);

    if (error) throw error;

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
