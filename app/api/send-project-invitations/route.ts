import { NextRequest } from "next/server";
import { getAuthenticatedUser, apiResponse, apiError } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user and supabase client
    const { user, supabase } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError("Authorization required", 401);
    }

    const { projectId, tenderTitle, partnerIds } = await request.json();

    if (!projectId || !partnerIds || !Array.isArray(partnerIds)) {
      return apiError("projectId and partnerIds are required", 400);
    }

    // Get project details
    const { data: project, error: projectError } = await supabase
      .from("virtual_organizations")
      .select("*, companies:lead_company_id(*)")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("Project fetch error:", projectError);
      return apiError(projectError.message, 500);
    }

    // Get partner companies
    const { data: partners, error: partnersError } = await supabase
      .from("companies")
      .select("*")
      .in("id", partnerIds);

    if (partnersError) {
      console.error("Partners fetch error:", partnersError);
      return apiError(partnersError.message, 500);
    }

    if (!partners || partners.length === 0) {
      return apiError("No valid partners found", 400);
    }

    // Send invitation messages (creates partnership_messages records)
    const invitationPromises = partners.map(async (partner) => {
      const leadCompany = project.companies as { company_name?: string } | null;

      await supabase.from("partnership_messages").insert({
        from_company_id: project.lead_company_id,
        to_company_id: partner.id,
        subject: `Invitation to collaborate on ${tenderTitle}`,
        message: `
You have been invited to join a consulting team for the tender "${tenderTitle}".

Lead Company: ${leadCompany?.company_name || "Unknown"}
Project: ${project.name}

This collaboration opportunity has been identified based on your company's capabilities and expertise.

Please review the project details and respond to this invitation.
        `.trim(),
        tender_id: project.target_tender_id,
      });

      // In a production system, you would send actual emails here
      console.log(
        `Invitation sent to ${partner.company_name} (${partner.contact_email})`,
      );
    });

    await Promise.all(invitationPromises);

    await logApiEvent(request, {
      actionType: "project_member_invited",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "vo_project",
      entityId: projectId,
      details: { partner_count: partners.length, tender_title: tenderTitle },
    }).catch(() => {});

    return apiResponse({
      success: true,
      invitationsSent: partners.length,
    });
  } catch (error) {
    console.error("Error in send-project-invitations:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
