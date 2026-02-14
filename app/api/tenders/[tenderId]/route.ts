import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenderId: string }> },
) {
  try {
    await requireAuth(request);
    const { tenderId } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("tenders")
      .select("*")
      .eq("id", tenderId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return apiResponse({ error: "Tender not found" }, 404);
    }

    // Fetch taxonomies
    const { data: taxData } = await supabase
      .from("tender_taxonomies")
      .select("taxonomy_id, taxonomies(id, name)")
      .eq("tender_id", tenderId);

    const taxonomies = (taxData || [])
      .map((ct) => {
        const t = ct.taxonomies as { id: string; name: string } | null;
        return t ? { id: t.id, name: t.name } : null;
      })
      .filter(Boolean);

    return apiResponse({ tender: data, taxonomies });
  } catch (error) {
    return handleApiError(error);
  }
}
