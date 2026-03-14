import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema/app";
import { eq, desc } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { userId } = await params;

    const data = await db
      .select()
      .from(events)
      .where(eq(events.userId, userId))
      .orderBy(desc(events.createdAt))
      .limit(100);

    return apiResponse({ events: data });
  } catch (error) {
    return handleApiError(error);
  }
}
