import { NextRequest } from "next/server";
import { and, eq, ilike } from "drizzle-orm";
import { apiResponse } from "@/lib/api";
import { handleApiError, requireAuth, validateBody } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { createCompany, createCompanyMember } from "@/lib/db/queries";
import { z } from "zod";

const createCompanyProfileSchema = z.object({
  company_name: z.string().min(1),
  companies_house_number: z.string().optional().nullable(),
  website_url: z.string().optional().nullable(),
  contact_person: z.string().optional().nullable(),
  contact_email: z.string().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  consent_data_fetch: z.boolean().optional(),
  description: z.string().optional().nullable(),
  key_capabilities: z.string().optional().nullable(),
  certifications: z.string().optional().nullable(),
  equipment: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  system_extracted: z.unknown().optional(),
  human_verified: z.unknown().optional(),
  financial_data: z.unknown().optional(),
  compliance_data: z.unknown().optional(),
  status: z.string().optional(),
  operation_locations: z.unknown().optional(),
  past_projects: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const body = await validateBody(request, createCompanyProfileSchema);

    const duplicateFilters = [];
    if (body.company_name?.trim()) {
      duplicateFilters.push(ilike(companies.companyName, body.company_name.trim()));
    }
    if (body.companies_house_number?.trim()) {
      duplicateFilters.push(
        eq(companies.companiesHouseNumber, body.companies_house_number.trim()),
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
      companyName: body.company_name.trim(),
      companiesHouseNumber: body.companies_house_number?.trim() || null,
      websiteUrl: body.website_url?.trim() || null,
      contactPerson: body.contact_person?.trim() || null,
      contactEmail: body.contact_email?.trim() || null,
      contactPhone: body.contact_phone?.trim() || null,
      consentDataFetch: body.consent_data_fetch ?? false,
      description: body.description || null,
      keyCapabilities: body.key_capabilities || null,
      certifications: body.certifications || null,
      equipment: body.equipment || null,
      address: body.address || null,
      postcode: body.postcode || null,
      systemExtracted: body.system_extracted ?? {},
      humanVerified: body.human_verified ?? {},
      financialData: body.financial_data ?? {},
      complianceData: body.compliance_data ?? {},
      status: body.status || "active",
      operationLocations: body.operation_locations ?? [],
      pastProjects: body.past_projects || null,
    });

    await createCompanyMember({
      companyId: company.id,
      userId: user.id,
      role: "admin",
      status: "approved",
    });

    return apiResponse({ success: true, company });
  } catch (error) {
    return handleApiError(error);
  }
}
