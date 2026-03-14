import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { profiles, userRoles } from "@/lib/db/schema/app";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    // Fetch all profiles
    const allProfiles = await db.select().from(profiles);

    // Fetch all roles
    const allRoles = await db.select().from(userRoles);

    return apiResponse({ profiles: allProfiles, roles: allRoles });
  } catch (error) {
    return handleApiError(error);
  }
}
