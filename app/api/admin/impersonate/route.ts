import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userRoles } from "@/lib/db/schema/app";
import { and, eq } from "drizzle-orm";

/**
 * Carry Better Auth's Set-Cookie values through to the browser.
 *
 * Both session swaps emit *several* cookies, and the first ones are deletions:
 * the impersonate handler clears the current session before writing the admin
 * cookie and the new session token. `Headers.get("set-cookie")` collapses them
 * into a single comma-joined string, and a browser reads one `Set-Cookie`
 * header as exactly one cookie — so it would see only the deletion and log the
 * admin out. `getSetCookie()` keeps them separate; the tuple-array `HeadersInit`
 * preserves the repeated key that an object literal cannot.
 */
function withAuthCookies(headers: Headers | undefined): NextResponse {
  const setCookies = headers?.getSetCookie() ?? [];
  return apiResponse(
    { success: true },
    200,
    setCookies.map((cookie) => ["set-cookie", cookie] as [string, string]),
  );
}

/**
 * Start impersonating a user — the "view as user" preview behind the
 * pre-approval console.
 *
 * Delegates the session swap to Better Auth's admin plugin (which stamps
 * `session.impersonatedBy`, caps the session at an hour, and refuses to
 * impersonate another admin) and adds this app's own audit trail on top.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    if (!(await checkSuperadminRole(user.id))) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    const body = await request.json().catch(() => ({}));
    const { userId } = body as { userId?: string };
    if (!userId || typeof userId !== "string") {
      return apiError("userId is required", 400);
    }
    if (userId === user.id) {
      return apiError("You cannot impersonate yourself", 400);
    }

    // Defence in depth: the plugin already blocks admin-on-admin impersonation
    // via `user.role`, but this app's source of truth is `user_roles`.
    const targetIsSuperadmin = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, "superadmin")))
      .limit(1)
      .then((rows) => rows.length > 0);
    if (targetIsSuperadmin) {
      return apiError("Cannot impersonate another superadmin", 403);
    }

    // Audited before the session swaps, so the row is attributed to the admin.
    await logApiEvent(request, {
      actionType: "admin_impersonation_started",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "user",
      entityId: userId,
      details: { impersonatedUserId: userId },
    });

    const result = await auth.api.impersonateUser({
      body: { userId },
      headers: request.headers,
      returnHeaders: true,
    });

    return withAuthCookies(result.headers);
  } catch (error) {
    console.error("Impersonation error:", error);
    return handleApiError(error);
  }
}

/** Stop impersonating and restore the admin's own session. */
export async function DELETE(request: NextRequest) {
  try {
    // Read the session directly rather than via `requireAuth`: the same call
    // both authenticates and yields the admin behind the impersonation.
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return apiError("Unauthorized", 401);
    }

    const impersonatedBy = (
      session.session as { impersonatedBy?: string | null } | undefined
    )?.impersonatedBy;
    if (!impersonatedBy) {
      return apiError("This session is not impersonating anyone", 400);
    }

    // Audited before the session swaps, so the row is attributed to the admin.
    await logApiEvent(request, {
      actionType: "admin_impersonation_stopped",
      userId: impersonatedBy,
      entityType: "user",
      entityId: session.user.id,
      details: { impersonatedUserId: session.user.id },
    });

    const result = await auth.api.stopImpersonating({
      headers: request.headers,
      returnHeaders: true,
    });

    return withAuthCookies(result.headers);
  } catch (error) {
    console.error("Stop impersonation error:", error);
    return handleApiError(error);
  }
}
