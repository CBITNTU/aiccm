import { NextRequest } from "next/server";
import { and, eq, ilike } from "drizzle-orm";
import { apiResponse } from "@/lib/api";
import { handleApiError, requireAuth, validateBody } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { createCompany, createCompanyMember } from "@/lib/db/queries";
import { refreshCompanyEmbedding } from "@/lib/services/embeddingService";
import { z } from "zod";

const createCompanyProfileSchema = z.object({
  companyName: z.string().min(1).optional(),
  company_name: z.string().min(1).optional(),
  companiesHouseNumber: z.string().optional().nullable(),
  companies_house_number: z.string().optional().nullable(),
  websiteUrl: z.string().optional().nullable(),
  website_url: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  contact_person: z.string().optional().nullable(),
  contactEmail: z.string().optional().nullable(),
  contact_email: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  consentDataFetch: z.boolean().optional(),
  consent_data_fetch: z.boolean().optional(),
  description: z.string().optional().nullable(),
  keyCapabilities: z.string().optional().nullable(),
  key_capabilities: z.string().optional().nullable(),
  certifications: z.string().optional().nullable(),
  equipment: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  systemExtracted: z.unknown().optional(),
  system_extracted: z.unknown().optional(),
  humanVerified: z.unknown().optional(),
  human_verified: z.unknown().optional(),
  financialData: z.unknown().optional(),
  financial_data: z.unknown().optional(),
  complianceData: z.unknown().optional(),
  compliance_data: z.unknown().optional(),
  status: z.string().optional(),
  operationLocations: z.unknown().optional(),
  operation_locations: z.unknown().optional(),
  pastProjects: z.string().optional().nullable(),
  past_projects: z.string().optional().nullable(),
}).refine(
  (data) => !!(data.companyName || data.company_name),
  { message: "companyName is required", path: ["companyName"] },
);

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const body = await validateBody(request, createCompanyProfileSchema);

    const companyName = (body.companyName ?? body.company_name)!;
    const companiesHouseNumber = body.companiesHouseNumber ?? body.companies_house_number;
    const websiteUrl = body.websiteUrl ?? body.website_url;
    const contactPerson = body.contactPerson ?? body.contact_person;
    const contactEmail = body.contactEmail ?? body.contact_email;
    const contactPhone = body.contactPhone ?? body.contact_phone;
    const consentDataFetch = body.consentDataFetch ?? body.consent_data_fetch;
    const keyCapabilities = body.keyCapabilities ?? body.key_capabilities;
    const systemExtracted = body.systemExtracted ?? body.system_extracted;
    const humanVerified = body.humanVerified ?? body.human_verified;
    const financialData = body.financialData ?? body.financial_data;
    const complianceData = body.complianceData ?? body.compliance_data;
    const operationLocations = body.operationLocations ?? body.operation_locations;
    const pastProjects = body.pastProjects ?? body.past_projects;

    const duplicateFilters = [];
    if (companyName?.trim()) {
      duplicateFilters.push(ilike(companies.companyName, companyName.trim()));
    }
    if (companiesHouseNumber?.trim()) {
      duplicateFilters.push(
        eq(companies.companiesHouseNumber, companiesHouseNumber.trim()),
      );
    }

    if (duplicateFilters.length > 0) {
      const existingRows = await db
        .select({ id: companies.id })
        .from(companies)
        .where(
          duplicateFilters.length === 1
            ? duplicateFilters[0]
            : and(...duplicateFilters),
        )
        .limit(1);

      if (existingRows[0]) {
        return apiResponse(
          { error: "A company with this name or number already exists." },
          409,
        );
      }
    }

    const company = await createCompany({
      userId: user.id,
      companyName: companyName.trim(),
      companiesHouseNumber: companiesHouseNumber?.trim() || null,
      websiteUrl: websiteUrl?.trim() || null,
      contactPerson: contactPerson?.trim() || null,
      contactEmail: contactEmail?.trim() || null,
      contactPhone: contactPhone?.trim() || null,
      consentDataFetch: consentDataFetch ?? false,
      description: body.description || null,
      keyCapabilities: keyCapabilities || null,
      certifications: body.certifications || null,
      equipment: body.equipment || null,
      address: body.address || null,
      postcode: body.postcode || null,
      systemExtracted: systemExtracted ?? {},
      humanVerified: humanVerified ?? {},
      financialData: financialData ?? {},
      complianceData: complianceData ?? {},
      status: body.status || "active",
      operationLocations: operationLocations ?? [],
      pastProjects: pastProjects || null,
    });

    await createCompanyMember({
      companyId: company.id,
      userId: user.id,
      role: "admin",
      status: "approved",
    });

    // Seed the basic-match vector, matching onboarding/update-step.
    await refreshCompanyEmbedding(company.id);

    return apiResponse({ success: true, company });
  } catch (error) {
    return handleApiError(error);
  }
}
