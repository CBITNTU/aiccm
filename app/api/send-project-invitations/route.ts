import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
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
import { db } from "@/lib/db";
import {
  virtualOrganizations,
  voMembers,
  companies,
  tenders,
  companyMembers,
  partnershipMessages,
} from "@/lib/db/schema/app";
import { user as userTable } from "@/lib/db/schema/auth";
import { eq, and, inArray } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    const { projectId, tenderTitle, partnerIds } = await request.json();

    if (!projectId || !partnerIds || !Array.isArray(partnerIds)) {
      throw new ValidationError("projectId and partnerIds are required");
    }

    // Get project details with lead company
    const projectRows = await db
      .select({
        project: virtualOrganizations,
        leadCompany: companies,
      })
      .from(virtualOrganizations)
      .leftJoin(companies, eq(virtualOrganizations.leadCompanyId, companies.id))
      .where(eq(virtualOrganizations.id, projectId))
      .limit(1);

    const projectRow = projectRows[0];
    if (!projectRow) {
      throw new ValidationError("Project not found");
    }

    const project = projectRow.project;
    const leadCompany = projectRow.leadCompany;

    // Verify user has access to lead company
    const hasAccess = await isCompanyMember(user.id, project.leadCompanyId);
    if (!hasAccess) {
      throw new AuthError("No access to this project");
    }

    // Get tender details if linked
    let tender: {
      title?: string;
      buyer?: string;
      deadline?: Date | null;
      budgetMax?: number | null;
    } | null = null;
    if (project.targetTenderId) {
      const tenderRows = await db
        .select({
          title: tenders.title,
          buyer: tenders.buyer,
          deadline: tenders.deadline,
          budgetMax: tenders.budgetMax,
        })
        .from(tenders)
        .where(eq(tenders.id, project.targetTenderId))
        .limit(1);
      tender = tenderRows[0] || null;
    }

    // Get partner companies
    const partners = await db
      .select({
        id: companies.id,
        companyName: companies.companyName,
        contactEmail: companies.contactEmail,
        userId: companies.userId,
      })
      .from(companies)
      .where(inArray(companies.id, partnerIds));

    if (!partners || partners.length === 0) {
      throw new ValidationError("No valid partners found");
    }

    let invitationsSent = 0;
    const unregisteredCompanies: string[] = [];

    for (const partner of partners) {
      // Update vo_members invitation status
      await db
        .update(voMembers)
        .set({
          invitationStatus: "sent",
          invitationSentAt: new Date(),
        })
        .where(
          and(eq(voMembers.voId, projectId), eq(voMembers.companyId, partner.id)),
        );

      // Get the invitation token for this member
      const memberRows = await db
        .select()
        .from(voMembers)
        .where(
          and(eq(voMembers.voId, projectId), eq(voMembers.companyId, partner.id)),
        )
        .limit(1);

      const memberRow = memberRows[0];

      // Find admin emails for this company
      const adminEmails: string[] = [];

      // Company owner
      if (partner.userId) {
        if (partner.contactEmail) {
          adminEmails.push(partner.contactEmail);
        } else {
          // Fall back to auth user email
          const authUserRows = await db
            .select({ email: userTable.email })
            .from(userTable)
            .where(eq(userTable.id, partner.userId))
            .limit(1);
          if (authUserRows[0]?.email) {
            adminEmails.push(authUserRows[0].email);
          }
        }
      }

      // Also check company_members with admin role
      const adminMemberRows = await db
        .select({ userId: companyMembers.userId })
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.companyId, partner.id),
            eq(companyMembers.role, "admin"),
            eq(companyMembers.status, "approved"),
          ),
        );

      if (adminMemberRows.length > 0) {
        const adminUserIds = adminMemberRows.map((am) => am.userId);
        const authUsers = await db
          .select({ email: userTable.email })
          .from(userTable)
          .where(inArray(userTable.id, adminUserIds));

        for (const au of authUsers) {
          if (au.email && !adminEmails.includes(au.email)) {
            adminEmails.push(au.email);
          }
        }
      }

      if (adminEmails.length === 0) {
        // System company or no registered users -- skip email
        unregisteredCompanies.push(partner.companyName || partner.id);
        continue;
      }

      // Build invitation link
      const invitationToken = memberRow?.invitationToken;
      const invitationLink = getPlatformUrl(
        `/projects/invitations?token=${invitationToken || ""}`,
      );

      const emailData: ProjectInvitationEmailData = {
        recipientName: partner.companyName || "Team",
        invitingCompanyName: leadCompany?.companyName || "Unknown",
        invitingCompanyContact:
          leadCompany?.contactEmail || user.email || "N/A",
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
        tenderValue: tender?.budgetMax
          ? `\u00A3${tender.budgetMax.toLocaleString()}`
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
      await db.insert(partnershipMessages).values({
        fromCompanyId: project.leadCompanyId,
        toCompanyId: partner.id,
        subject: `Invitation to collaborate on ${tenderTitle || project.name}`,
        message: `You have been invited to join the project "${project.name}"${tender?.title ? ` targeting the tender "${tender.title}"` : ""}.`,
        tenderId: project.targetTenderId,
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
