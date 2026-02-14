import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (error) throw error;

    const roles = data || [];
    const superadminRole = roles.find((r) => r.role === "superadmin");
    const smeOwnerRole = roles.find((r) => r.role === "sme-owner");

    let role: string | null = null;
    if (superadminRole) {
      role = superadminRole.role;
    } else if (smeOwnerRole) {
      role = smeOwnerRole.role;
    } else {
      role = roles[0]?.role || null;
    }

    return apiResponse({ role, isAdmin: role === "superadmin" });
  } catch (error) {
    return handleApiError(error);
  }
}
