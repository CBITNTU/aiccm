import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { createUserRole, deleteUserRole } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/schema/auth";
import { eq } from "drizzle-orm";

/**
 * Mirror the app's `superadmin` role onto Better Auth's own `user.role` column.
 *
 * The admin plugin (impersonation, ban) authorizes off `user.role`, cannot see
 * `user_roles`, and only accepts roles declared in its access-control config —
 * hence its built-in "admin" rather than "superadmin". Migration 0014 backfills
 * existing superadmins.
 */
async function syncBetterAuthRole(userId: string, isSuperadmin: boolean) {
  await db
    .update(userTable)
    .set({ role: isSuperadmin ? "admin" : "user" })
    .where(eq(userTable.id, userId));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { userId } = await params;
    const body = await request.json();
    const { role } = body as { role: "superadmin" | "sme-owner" | "sme-member" | "individual" };

    const data = await createUserRole(userId, role);

    if (role === "superadmin") {
      await syncBetterAuthRole(userId, true);
    }

    return apiResponse({ role: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { userId } = await params;

    const { searchParams } = new URL(request.url);
    const role = (searchParams.get("role") || "superadmin") as "superadmin" | "sme-owner" | "sme-member" | "individual";

    await deleteUserRole(userId, role);

    if (role === "superadmin") {
      await syncBetterAuthRole(userId, false);
    }

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
