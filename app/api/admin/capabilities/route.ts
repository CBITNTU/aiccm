import { NextRequest } from "next/server";
import { apiResponse, createAdminClient, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const supabase = createAdminClient();

    // Fetch all capabilities with pagination (1000 at a time like the original)
    const allCapabilities: Record<string, unknown>[] = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("company_capabilities_ref")
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      allCapabilities.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return apiResponse({ capabilities: allCapabilities });
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

    const { data, error } = await supabase
      .from("company_capabilities_ref")
      .insert(body)
      .select()
      .single();

    if (error) throw error;

    return apiResponse({ capability: data });
  } catch (error) {
    return handleApiError(error);
  }
}
