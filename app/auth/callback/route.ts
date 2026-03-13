import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getProfileByUserId, getUserRoleByUserId } from "@/lib/db/queries";
import { isValidRedirectUrl } from "@/lib/utils/redirectUrl";

/**
 * GET /auth/callback
 *
 * Post-verification redirect handler for Better Auth.
 * Better Auth handles email verification via its built-in /api/auth/verify-email endpoint,
 * then redirects here. We check the session and route the user appropriately.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const nextParam = searchParams.get("next");
  const safeNext = isValidRedirectUrl(nextParam) ? nextParam!.trim() : null;

  try {
    // Check Better Auth session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (session?.user) {
      const userId = session.user.id;
      const profile = await getProfileByUserId(userId);

      let next = safeNext ?? "/dashboard";

      if (!profile?.onboardingCompletedAt) {
        next = "/onboarding";
      } else if (profile?.approvalStatus === "pending") {
        next = "/pending-approval";
      } else if (profile?.approvalStatus === "rejected") {
        next = "/auth?rejected=true";
      } else {
        const roleData = await getUserRoleByUserId(userId);
        if (roleData?.role === "superadmin") {
          next = "/admin";
        } else {
          next = safeNext ?? "/dashboard";
        }
      }

      // Add email_verified flag if this was a verification callback
      const callbackToken = searchParams.get("token");
      const redirectPath = callbackToken
        ? `${next}${next.includes("?") ? "&" : "?"}email_verified=true`
        : next;

      return NextResponse.redirect(`${origin}${redirectPath}`);
    }
  } catch (error) {
    console.error("Auth callback error:", error);
  }

  return NextResponse.redirect(
    `${origin}/auth?error=Could+not+authenticate+user`,
  );
}
