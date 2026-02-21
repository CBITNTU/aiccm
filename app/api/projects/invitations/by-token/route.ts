import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { handleApiError, ValidationError } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      throw new ValidationError("token is required");
    }

    const supabase = createAdminClient();

    // Look up invitation by token
    const { data: memberRow, error } = await supabase
      .from("vo_members")
      .select(
        `
        *,
        virtual_organizations:vo_id (
          id,
          name,
          description,
          lead_company_id,
          target_tender_id
        )
      `,
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("invitation_token" as any, token)
      .single();

    const member = memberRow as (typeof memberRow) & {
      invitation_status: string | null;
      invitation_sent_at: string | null;
    } | null;

    if (error || !member || !memberRow) {
      throw new ValidationError("Invalid or expired invitation token");
    }

    const vo = member.virtual_organizations as unknown as {
      id: string;
      name: string;
      description: string | null;
      lead_company_id: string;
      target_tender_id: string | null;
    } | null;

    if (!vo) {
      throw new ValidationError("Project not found");
    }

    // Get lead company name
    const { data: leadCompany } = await supabase
      .from("companies")
      .select("company_name, contact_email")
      .eq("id", vo.lead_company_id)
      .single();

    // Get tender title if linked
    let tenderTitle: string | null = null;
    if (vo.target_tender_id) {
      const { data: tender } = await supabase
        .from("tenders")
        .select("title")
        .eq("id", vo.target_tender_id)
        .single();
      tenderTitle = tender?.title || null;
    }

    return apiResponse({
      invitation: {
        id: member.id,
        vo_id: member.vo_id,
        company_id: member.company_id,
        invitation_status: member.invitation_status,
        projectName: vo.name,
        projectDescription: vo.description,
        leadCompanyName: leadCompany?.company_name || "Unknown",
        leadCompanyContact: leadCompany?.contact_email || null,
        tenderTitle,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
