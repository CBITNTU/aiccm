import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  getUserCompanyIds,
  handleApiError,
} from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const supabase = createAdminClient();

    // Get all company IDs the user has access to
    const companyIds = await getUserCompanyIds(user.id);

    if (companyIds.length === 0) {
      return apiResponse({ invitations: [] });
    }

    // Fetch pending invitations for user's companies
    // Use * to include new columns not yet in generated types
    const { data: members, error } = await supabase
      .from("vo_members")
      .select(
        `
        *,
        virtual_organizations:vo_id (
          id,
          name,
          description,
          status,
          lead_company_id,
          target_tender_id
        )
      `,
      )
      .in("company_id", companyIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("invitation_status" as any, "sent");

    if (error) throw error;

    // Enrich with lead company and tender info
    const invitations = [];
    for (const memberRow of members || []) {
      const member = memberRow as typeof memberRow & {
        invitation_status: string | null;
        invitation_sent_at: string | null;
        invitation_message: string | null;
      };
      const vo = member.virtual_organizations as unknown as {
        id: string;
        name: string;
        description: string | null;
        status: string;
        lead_company_id: string;
        target_tender_id: string | null;
      } | null;

      if (!vo) continue;

      // Get lead company
      const { data: leadCompany } = await supabase
        .from("companies")
        .select("id, company_name, contact_email, contact_phone")
        .eq("id", vo.lead_company_id)
        .single();

      // Get tender if linked
      let tender = null;
      if (vo.target_tender_id) {
        const { data: t } = await supabase
          .from("tenders")
          .select("id, title, buyer, deadline, budget_max")
          .eq("id", vo.target_tender_id)
          .single();
        tender = t;
      }

      invitations.push({
        id: member.id,
        vo_id: member.vo_id,
        company_id: member.company_id,
        invitation_status: member.invitation_status,
        invitation_sent_at: member.invitation_sent_at,
        project: {
          id: vo.id,
          name: vo.name,
          description: vo.description,
          status: vo.status,
        },
        leadCompany: leadCompany
          ? {
              id: leadCompany.id,
              name: leadCompany.company_name,
              contactEmail: leadCompany.contact_email,
              contactPhone: leadCompany.contact_phone,
            }
          : null,
        tender,
      });
    }

    return apiResponse({ invitations });
  } catch (error) {
    return handleApiError(error);
  }
}
