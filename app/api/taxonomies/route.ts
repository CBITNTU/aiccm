import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { taxonomies } from "@/lib/db/schema/app";
import { asc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const data = await db
      .select()
      .from(taxonomies)
      .orderBy(asc(taxonomies.level), asc(taxonomies.name));

    return apiResponse({ taxonomies: data });
  } catch (error) {
    return handleApiError(error);
  }
}
