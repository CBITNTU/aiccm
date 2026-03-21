import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, userRoles } from "@/lib/db/schema/app";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    // Fetch all profiles, deduplicated by user_id (keep most recent)
    const allProfiles = await db
      .selectDistinctOn([profiles.userId])
      .from(profiles)
      .orderBy(profiles.userId, desc(profiles.createdAt));

    // Fetch all roles
    const allRoles = await db.select().from(userRoles);

    return apiResponse({ profiles: allProfiles, roles: allRoles });
  } catch (error) {
    return handleApiError(error);
  }
}
