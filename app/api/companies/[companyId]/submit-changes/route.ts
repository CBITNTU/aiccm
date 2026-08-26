import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies, companyVerificationRequests } from "@/lib/db/schema/app";
import { eq, and } from "drizzle-orm";
import type { PendingChanges } from "@/lib/companyFieldCategories";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    const company = await db
      .select({
        verificationStatus: companies.verificationStatus,
        pendingChanges: companies.pendingChanges,
        companyName: companies.companyName,
        description: companies.description,
        contactEmail: companies.contactEmail,
        contactPhone: companies.contactPhone,
        postcode: companies.postcode,
        address: companies.address,
        websiteUrl: companies.websiteUrl,
        companiesHouseNumber: companies.companiesHouseNumber,
        keyCapabilities: companies.keyCapabilities,
        certifications: companies.certifications,
        equipment: companies.equipment,
        pastProjects: companies.pastProjects,
        logoUrl: companies.logoUrl,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0]);

    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    if (company.verificationStatus !== "verified") {
      return apiResponse({ error: "Only verified companies can submit changes for review" }, 400);
    }

    const pendingChanges = company.pendingChanges as PendingChanges | null;
    if (!pendingChanges) {
      return apiResponse({ error: "No pending changes to submit" }, 400);
    }

    // Check for existing pending change_review request
    const existingRequest = await db
      .select({ id: companyVerificationRequests.id })
      .from(companyVerificationRequests)
      .where(
        and(
          eq(companyVerificationRequests.companyId, companyId),
          eq(companyVerificationRequests.requestType, "change_review"),
          eq(companyVerificationRequests.status, "pending"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (existingRequest) {
      return apiResponse(
        { error: "A change review is already pending. Please wait for admin review." },
        400,
      );
    }

    const body = await request.json().catch(() => ({}));
    const submissionNotes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null;

    // Create snapshot of current approved company data
    const companySnapshot = {
      companyName: company.companyName,
      description: company.description,
      contactEmail: company.contactEmail,
      contactPhone: company.contactPhone,
      postcode: company.postcode,
      address: company.address,
      websiteUrl: company.websiteUrl,
      companiesHouseNumber: company.companiesHouseNumber,
      keyCapabilities: company.keyCapabilities,
      certifications: company.certifications,
      equipment: company.equipment,
      pastProjects: company.pastProjects,
      // Reviewable like any other scalar, so the admin diff re-derives its
      // "current" side from here. Omitting it renders every logo change as
      // "Current: Empty" and makes the change unreviewable.
      logoUrl: company.logoUrl,
    };

    // Create review request with pendingChanges snapshot
    const verificationRequest = await db
      .insert(companyVerificationRequests)
      .values({
        companyId,
        submittedBy: user.id,
        status: "pending",
        requestType: "change_review",
        submissionNotes,
        companySnapshot,
        pendingChangesSnapshot: pendingChanges,
      })
      .returning()
      .then((rows) => rows[0]);

    return apiResponse({ verificationRequest });
  } catch (error) {
    return handleApiError(error);
  }
}
