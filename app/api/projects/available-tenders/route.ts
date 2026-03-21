import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { tenders } from "@/lib/db/schema/app";
import { inArray, asc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const data = await db
      .select({
        id: tenders.id,
        title: tenders.title,
        buyer: tenders.buyer,
        deadline: tenders.deadline,
      })
      .from(tenders)
      .where(inArray(tenders.status, ["open", "closing_soon"]))
      .orderBy(asc(tenders.deadline))
      .limit(50);

    return apiResponse({ tenders: data });
  } catch (error) {
    return handleApiError(error);
  }
}
