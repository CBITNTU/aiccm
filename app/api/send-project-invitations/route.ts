import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
  ValidationError,
} from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import {
  sendEmail,
  getPlatformUrl,
  getProjectInvitationEmailSubject,
  getProjectInvitationEmailHtml,
  type ProjectInvitationEmailData,
} from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const supabase = createAdminClient();

    const { projectId, tenderTitle, partnerIds } = await request.json();

    if (!projectId || !partnerIds || !Array.isArray(partnerIds)) {
      throw new ValidationError("projectId and partnerIds are required");
    }

    // Get project details with lead company
    const { data: project, error: projectError } = await supabase
      .from("virtual_organizations")
      .select("*, companies:lead_company_id(*)")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      throw new ValidationError("Project not found");
    }

    // Verify user has access to lead company
    const hasAccess = await isCompanyMember(user.id, project.lead_company_id);
    if (!hasAccess) {
      throw new AuthError("No access to this project");
    }

    const leadCompany = project.companies as {
      company_name?: string;
      contact_email?: string;
      contact_phone?: string;
    } | null;

    // Get tender details if linked
    let tender: {
      title?: string;
      buyer?: string;
      deadline?: string | null;
      budget_max?: number | null;
    } | null = null;
    if (project.target_tender_id) {
      const { data: t } = await supabase
        .from("tenders")
        .select("title, buyer, deadline, budget_max")
        .eq("id", project.target_tender_id)
        .single();
      tender = t;
    }

    // Get partner companies
    const { data: partners, error: partnersError } = await supabase
      .from("companies")
      .select("id, company_name, contact_email, user_id")
      .in("id", partnerIds);

    if (partnersError || !partners || partners.length === 0) {
      throw new ValidationError("No valid partners found");
    }

    let invitationsSent = 0;
    const unregisteredCompanies: string[] = [];

    for (const partner of partners) {
      // Update vo_members invitation status
       
      await supabase
        .from("vo_members")
        .update({
          invitation_status: "sent",
          invitation_sent_at: new Date().toISOString(),
        } as any)
        .eq("vo_id", projectId)
        .eq("company_id", partner.id);

      // Get the invitation token for this member
      const { data: memberRow } = await supabase
        .from("vo_members")
        .select("*")
        .eq("vo_id", projectId)
        .eq("company_id", partner.id)
        .single();

      // Find admin users for this company (owner + approved admin members)
      const adminEmails: string[] = [];

      // Company owner
      if (partner.user_id) {
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", partner.user_id)
          .single();

        if (partner.contact_email) {
          adminEmails.push(partner.contact_email);
        } else {
          // Fall back to auth user email
          const { data: authUser } = await supabase.auth.admin.getUserById(
            partner.user_id,
          );
          if (authUser?.user?.email) {
            adminEmails.push(authUser.user.email);
          }
        }

        // We use ownerProfile just for dedup logic below
        void ownerProfile;
      }

      // Also check company_members with admin role
      const { data: adminMembers } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", partner.id)
        .eq("role", "admin")
        .eq("status", "approved");

      if (adminMembers) {
        for (const am of adminMembers) {
          const { data: authUser } = await supabase.auth.admin.getUserById(
            am.user_id,
          );
          if (authUser?.user?.email && !adminEmails.includes(authUser.user.email)) {
            adminEmails.push(authUser.user.email);
          }
        }
      }

      if (adminEmails.length === 0) {
        // System company or no registered users — skip email
        unregisteredCompanies.push(partner.company_name || partner.id);
        continue;
      }

      // Build invitation link
      const invitationToken = (memberRow as Record<string, unknown>)
        ?.invitation_token as string | undefined;
      const invitationLink = getPlatformUrl(
        `/projects/invitations?token=${invitationToken || ""}`,
      );

      const emailData: ProjectInvitationEmailData = {
        recipientName: partner.company_name || "Team",
        invitingCompanyName: leadCompany?.company_name || "Unknown",
        invitingCompanyContact:
          leadCompany?.contact_email || user.email || "N/A",
        projectName: project.name,
        projectDescription: project.description || undefined,
        tenderTitle: tender?.title,
        tenderBuyer: tender?.buyer,
        tenderDeadline: tender?.deadline
          ? new Date(tender.deadline).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : undefined,
        tenderValue: tender?.budget_max
          ? `£${tender.budget_max.toLocaleString()}`
          : undefined,
        invitationLink,
      };

      // Send email to all admins
      await sendEmail({
        to: adminEmails,
        subject: getProjectInvitationEmailSubject(emailData),
        html: getProjectInvitationEmailHtml(emailData),
      });

      // Create partnership_messages record for audit
      await supabase.from("partnership_messages").insert({
        from_company_id: project.lead_company_id,
        to_company_id: partner.id,
        subject: `Invitation to collaborate on ${tenderTitle || project.name}`,
        message: `You have been invited to join the project "${project.name}"${tender?.title ? ` targeting the tender "${tender.title}"` : ""}.`,
        tender_id: project.target_tender_id,
      });

      invitationsSent++;
    }

    await logApiEvent(request, {
      actionType: "project_member_invited",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "vo_project",
      entityId: projectId,
      details: {
        partner_count: partners.length,
        invitations_sent: invitationsSent,
        unregistered_count: unregisteredCompanies.length,
        tender_title: tenderTitle,
      },
    }).catch(() => {});

    return apiResponse({
      success: true,
      invitationsSent,
      unregisteredCompanies,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
