import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { handleApiError, ValidationError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import {
  voMembers,
  virtualOrganizations,
  companies,
  tenders,
} from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      throw new ValidationError("token is required");
    }

    // Look up invitation by token
    const memberRows = await db
      .select({
        member: voMembers,
        vo: {
          id: virtualOrganizations.id,
          name: virtualOrganizations.name,
          description: virtualOrganizations.description,
          leadCompanyId: virtualOrganizations.leadCompanyId,
          targetTenderId: virtualOrganizations.targetTenderId,
        },
      })
      .from(voMembers)
      .innerJoin(virtualOrganizations, eq(voMembers.voId, virtualOrganizations.id))
      .where(eq(voMembers.invitationToken, token))
      .limit(1);

    const row = memberRows[0];
    if (!row) {
      throw new ValidationError("Invalid or expired invitation token");
    }

    const { member, vo } = row;

    // Get lead company name
    const leadCompanyRows = await db
      .select({
        companyName: companies.companyName,
        contactEmail: companies.contactEmail,
      })
      .from(companies)
      .where(eq(companies.id, vo.leadCompanyId))
      .limit(1);

    const leadCompany = leadCompanyRows[0];

    // Get tender title if linked
    let tenderTitle: string | null = null;
    if (vo.targetTenderId) {
      const tenderRows = await db
        .select({ title: tenders.title })
        .from(tenders)
        .where(eq(tenders.id, vo.targetTenderId))
        .limit(1);
      tenderTitle = tenderRows[0]?.title || null;
    }

    return apiResponse({
      invitation: {
        id: member.id,
        voId: member.voId,
        companyId: member.companyId,
        invitationStatus: member.invitationStatus,
        projectName: vo.name,
        projectDescription: vo.description,
        leadCompanyName: leadCompany?.companyName || "Unknown",
        leadCompanyContact: leadCompany?.contactEmail || null,
        tenderTitle,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
