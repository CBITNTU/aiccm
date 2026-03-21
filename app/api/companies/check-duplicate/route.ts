import { NextRequest } from "next/server";
import { and, eq, ilike } from "drizzle-orm";
import { apiResponse } from "@/lib/api";
import { handleApiError, requireAuth } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const searchParams = request.nextUrl.searchParams;
    const companyName = searchParams.get("companyName")?.trim();
    const companiesHouseNumber = searchParams.get("companiesHouseNumber")?.trim();

    if (!companyName && !companiesHouseNumber) {
      return apiResponse(
        { exists: false, company: null, message: "No lookup values provided" },
        200,
      );
    }

    const filters = [];
    if (companyName) {
      filters.push(ilike(companies.companyName, companyName));
    }
    if (companiesHouseNumber) {
      filters.push(eq(companies.companiesHouseNumber, companiesHouseNumber));
    }

    const result = await db
      .select({
        id: companies.id,
        companyName: companies.companyName,
      })
      .from(companies)
      .where(filters.length === 1 ? filters[0] : and(...filters))
      .limit(1);

    const existingCompany = result[0] ?? null;

    return apiResponse({
      exists: !!existingCompany,
      company: existingCompany,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
