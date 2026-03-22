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
import { eq, desc } from "drizzle-orm";

export async function GET(
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
      .select({ verificationStatus: companies.verificationStatus, verifiedAt: companies.verifiedAt })
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

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    // Get current company data
    const company = await db
      .select()
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
    if (!company.companyName) missingFields.push("companyName");
    if (!company.description) missingFields.push("description");
    if (!company.contactEmail) missingFields.push("contactEmail");
    if (!company.postcode) missingFields.push("postcode");

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

    // Create verification request
    const [verificationRequest] = await db
      .insert(companyVerificationRequests)
      .values({
        companyId,
        submittedBy: user.id,
        status: "pending",
        submissionNotes,
        companySnapshot,
      })
      .returning();

    // Update company verification status
    await db
      .update(companies)
      .set({ verificationStatus: "pending_verification", updatedAt: new Date() })
      .where(eq(companies.id, companyId));

    return apiResponse({ verificationRequest });
  } catch (error) {
    return handleApiError(error);
  }
}
