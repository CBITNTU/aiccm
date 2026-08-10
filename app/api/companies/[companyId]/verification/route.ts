import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { requireCompanyAccess } from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { companies, companyVerificationRequests } from "@/lib/db/schema/app";
import { eq, desc } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    await requireCompanyAccess(user.id, companyId);

    const company = await db
      .select({
        verificationStatus: companies.verificationStatus,
        verifiedAt: companies.verifiedAt,
        pendingChanges: companies.pendingChanges,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0]);

    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    // Get latest verification request
    const latestRequest = await db
      .select()
      .from(companyVerificationRequests)
      .where(eq(companyVerificationRequests.companyId, companyId))
      .orderBy(desc(companyVerificationRequests.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    return apiResponse({
      verificationStatus: company.verificationStatus,
      verifiedAt: company.verifiedAt,
      hasPendingChanges: !!company.pendingChanges,
      latestRequest,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    // Deliberately member-only: submitting for verification is the owner's act,
    // not the admin's. The console hides the submit button via `isAdminOverride`
    // (see VerificationBanner) rather than granting the admin this route.
    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    // Get current company data (only the fields this handler reads/snapshots)
    const company = await db
      .select({
        verificationStatus: companies.verificationStatus,
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
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0]);

    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    if (company.verificationStatus === "verified") {
      return apiResponse({ error: "Company is already verified" }, 400);
    }

    if (company.verificationStatus === "pending_verification") {
      return apiResponse({ error: "A verification request is already pending" }, 400);
    }

    // Validate minimum fields
    const missingFields: string[] = [];
    if (!company.companyName) missingFields.push("Company Name");
    if (!company.contactEmail) missingFields.push("Contact Email");
    if (!company.websiteUrl) missingFields.push("Website");
    if (!company.contactPhone) missingFields.push("Phone");
    if (!company.address) missingFields.push("Address");


    if (missingFields.length > 0) {
      return apiResponse(
        { error: `Missing required fields: ${missingFields.join(", ")}` },
        400,
      );
    }

    const body = await request.json().catch(() => ({}));
    const submissionNotes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null;

    // Create snapshot of company data
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
    };

    // Create verification request and update company status atomically
    const verificationRequest = await db.transaction(async (tx) => {
      const [request] = await tx
        .insert(companyVerificationRequests)
        .values({
          companyId,
          submittedBy: user.id,
          status: "pending",
          submissionNotes,
          companySnapshot,
        })
        .returning();

      await tx
        .update(companies)
        .set({ verificationStatus: "pending_verification", updatedAt: new Date() })
        .where(eq(companies.id, companyId));

      return request;
    });

    return apiResponse({ verificationRequest });
  } catch (error) {
    return handleApiError(error);
  }
}
