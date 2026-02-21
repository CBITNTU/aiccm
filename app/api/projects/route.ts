import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const supabase = createAdminClient();

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const status = searchParams.get("status") || "active";

    if (!companyId) {
      throw new AuthError("companyId is required");
    }

    // Verify user has access to this company
    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    const statusesToQuery =
      status === "active" ? ["draft", "active"] : [status];

    // 1. Owned projects (where company is the lead)
    const { data: ownedProjects, error: ownedError } = await supabase
      .from("virtual_organizations")
      .select(
        `
        *,
        tenders:target_tender_id (
          id,
          title,
          buyer,
          deadline
        )
      `,
      )
      .eq("lead_company_id", companyId)
      .in("status", statusesToQuery)
      .order("created_at", { ascending: false });

    if (ownedError) throw ownedError;

    // 2. Member projects (where company is an accepted member)
    const { data: memberRows, error: memberError } = await supabase
      .from("vo_members")
      .select(
        `
        vo_id,
        virtual_organizations:vo_id (
          *,
          tenders:target_tender_id (
            id,
            title,
            buyer,
            deadline
          )
        )
      `,
      )
      .eq("company_id", companyId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("invitation_status" as any, "accepted")
      .neq("role", "lead");

    if (memberError) throw memberError;

    // Build combined list
    const owned = (ownedProjects || []).map((p) => ({
      ...p,
      userRole: "owner" as const,
    }));

    const memberProjects: Array<Record<string, unknown> & { userRole: "member" }> = [];
    for (const row of memberRows || []) {
      const vo = row.virtual_organizations as unknown as Record<string, unknown> | null;
      if (!vo) continue;
      const voStatus = vo.status as string;
      if (!statusesToQuery.includes(voStatus)) continue;
      memberProjects.push({ ...vo, userRole: "member" as const });
    }

    // Merge, avoiding duplicates (a company could be both lead and member in theory)
    const seenIds = new Set(owned.map((p) => p.id));
    const merged: Array<Record<string, unknown>> = [...owned];
    for (const mp of memberProjects) {
      if (!seenIds.has(mp.id as string)) {
        merged.push(mp);
        seenIds.add(mp.id as string);
      }
    }

    return apiResponse({ projects: merged });
  } catch (error) {
    return handleApiError(error);
  }
}
