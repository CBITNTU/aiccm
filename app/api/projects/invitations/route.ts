import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  getUserCompanyIds,
  handleApiError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import {
  voMembers,
  virtualOrganizations,
  companies,
  tenders,
} from "@/lib/db/schema/app";
import { eq, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Get all company IDs the user has access to
    const companyIds = await getUserCompanyIds(user.id);

    if (companyIds.length === 0) {
      return apiResponse({ invitations: [] });
    }

    // Fetch pending invitations for user's companies
    const memberRows = await db
      .select({
        member: voMembers,
        vo: {
          id: virtualOrganizations.id,
          name: virtualOrganizations.name,
          description: virtualOrganizations.description,
          status: virtualOrganizations.status,
          leadCompanyId: virtualOrganizations.leadCompanyId,
          targetTenderId: virtualOrganizations.targetTenderId,
        },
      })
      .from(voMembers)
      .innerJoin(virtualOrganizations, eq(voMembers.voId, virtualOrganizations.id))
      .where(inArray(voMembers.companyId, companyIds));

    // Filter to "sent" invitations
    const sentMembers = memberRows.filter(
      (row) => row.member.invitationStatus === "sent",
    );

    // Enrich with lead company and tender info
    const invitations = [];
    for (const row of sentMembers) {
      const { member, vo } = row;

      // Get lead company
      const leadCompanyRows = await db
        .select({
          id: companies.id,
          companyName: companies.companyName,
          contactEmail: companies.contactEmail,
          contactPhone: companies.contactPhone,
        })
        .from(companies)
        .where(eq(companies.id, vo.leadCompanyId))
        .limit(1);

      const leadCompany = leadCompanyRows[0];

      // Get tender if linked
      let tender = null;
      if (vo.targetTenderId) {
        const tenderRows = await db
          .select({
            id: tenders.id,
            title: tenders.title,
            buyer: tenders.buyer,
            deadline: tenders.deadline,
            budgetMax: tenders.budgetMax,
          })
          .from(tenders)
          .where(eq(tenders.id, vo.targetTenderId))
          .limit(1);
        tender = tenderRows[0]
          ? {
              id: tenderRows[0].id,
              title: tenderRows[0].title,
              buyer: tenderRows[0].buyer,
              deadline: tenderRows[0].deadline,
              budgetMax: tenderRows[0].budgetMax,
            }
          : null;
      }

      invitations.push({
        id: member.id,
        voId: member.voId,
        companyId: member.companyId,
        invitationStatus: member.invitationStatus,
        invitationSentAt: member.invitationSentAt,
        project: {
          id: vo.id,
          name: vo.name,
          description: vo.description,
          status: vo.status,
        },
        leadCompany: leadCompany
          ? {
              id: leadCompany.id,
              name: leadCompany.companyName,
              contactEmail: leadCompany.contactEmail,
              contactPhone: leadCompany.contactPhone,
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
