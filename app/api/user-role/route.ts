import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { userRoles } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    const roles = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));

    const superadminRole = roles.find((r) => r.role === "superadmin");
    const smeOwnerRole = roles.find((r) => r.role === "sme-owner");

    let role: string | null = null;
    if (superadminRole) {
      role = superadminRole.role;
    } else if (smeOwnerRole) {
      role = smeOwnerRole.role;
    } else {
      role = roles[0]?.role || null;
    }

    return apiResponse({ role, isAdmin: role === "superadmin" });
  } catch (error) {
    return handleApiError(error);
  }
}
