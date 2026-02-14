import { NextRequest } from "next/server";
import { apiResponse, createAdminClient, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .order("company_name", { ascending: true });

    if (error) throw error;

    return apiResponse({ companies: data || [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const supabase = createAdminClient();
    const body = await request.json();

    // Check for existing company with same name
    if (body.company_name) {
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .eq("company_name", body.company_name)
        .eq("is_system_company", true)
        .maybeSingle();

      if (existing) {
        return apiResponse({ company: existing, alreadyExists: true });
      }
    }

    const { data, error } = await supabase
      .from("companies")
      .insert(body)
      .select()
      .single();

    if (error) throw error;

    return apiResponse({ company: data });
  } catch (error) {
    return handleApiError(error);
  }
}
