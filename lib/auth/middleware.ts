import { NextResponse, type NextRequest } from "next/server";
import { isValidRedirectUrl } from "@/lib/utils/redirectUrl";
import { getProfileByUserId, getUserRoleByUserId } from "@/lib/db/queries";

/** HTTP methods that cannot change server state. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Better Auth middleware helper.
 * Checks for Better Auth session cookie, validates it, then applies route protection.
 * Profile/role queries use Drizzle against local Postgres.
 */
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Get user ID from Better Auth session cookie
  let userId: string | null = null;
  // Set when a superadmin is impersonating this user. Approval gating is then
  // relaxed so the admin can preview a still-pending account exactly as its
  // owner will see it once approved.
  let isImpersonating = false;

  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value ??
    request.cookies.get("__Secure-better-auth.session_token")?.value;

  if (sessionToken) {
    try {
      const { auth } = await import("@/lib/auth");
      const session = await auth.api.getSession({
        headers: request.headers,
      });
      if (session?.user?.id) {
        userId = session.user.id;
        isImpersonating = !!(
          session.session as { impersonatedBy?: string | null } | undefined
        )?.impersonatedBy;
      }
    } catch {
      // Session invalid or expired
    }
  }

  // Impersonation is a read-only preview. Rejecting every mutating request
  // here — rather than trying to suppress the side effects one by one — means
  // an admin looking at a user's account can never write to it, enqueue AI work
  // for it, or cause it to be emailed. Editing happens in the admin console
  // instead, where the actor is the admin and email is suppressed explicitly.
  //
  // Enforced in middleware because it is the only layer that reliably sees
  // every request before its handler runs.
  if (
    isImpersonating &&
    !SAFE_METHODS.has(request.method) &&
    !request.nextUrl.pathname.startsWith("/api/admin/impersonate") &&
    !request.nextUrl.pathname.startsWith("/api/auth")
  ) {
    return NextResponse.json(
      {
        error:
          "This session is a read-only preview. Stop viewing as the user to make changes.",
      },
      { status: 403 },
    );
  }

  // No Better Auth session = unauthenticated
  if (!userId) {
    // Allow unauthenticated access to non-protected paths
    const protectedPaths = [
      "/dashboard",
      "/profile",
      "/onboarding",
      "/tenders",
      "/directory",
      "/company",
      "/vo",
      "/projects",
      "/my-company",
      "/my-companies",
      "/admin",
      "/pending-approval",
    ];

    const isProtectedPath = protectedPaths.some((path) =>
      request.nextUrl.pathname.startsWith(path),
    );

    if (isProtectedPath) {
      // Redirect /directory/[uuid] to public company page instead of /auth
      const directoryCompanyMatch = request.nextUrl.pathname.match(
        /^\/directory\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
      );
      if (directoryCompanyMatch) {
        const url = request.nextUrl.clone();
        url.pathname = `/companies/${directoryCompanyMatch[1]}`;
        return NextResponse.redirect(url);
      }

      const url = request.nextUrl.clone();
      url.pathname = "/auth";
      url.searchParams.set("redirectTo", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }

    return response;
  }

  // We have a Better Auth user — apply protection logic using Drizzle queries

  const protectedPaths = [
    "/dashboard",
    "/profile",
    "/onboarding",
    "/tenders",
    "/directory",
    "/company",
    "/vo",
    "/projects",
    "/my-company",
    "/my-companies",
    "/admin",
    "/pending-approval",
  ];

  const onboardingAllowedPaths = ["/onboarding", "/tenders", "/directory"];

  const approvalRequiredPaths = [
    "/dashboard",
    "/onboarding",
    "/company",
    "/vo",
    "/projects",
    "/admin",
  ];

  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );
  const isOnboardingAllowedPath = onboardingAllowedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );
  const isApprovalRequiredPath = approvalRequiredPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  // For authenticated users on protected paths, check profile status
  if (isProtectedPath) {
    try {
      const profile = await getProfileByUserId(userId);

      if (profile) {
        const isOnboardingPath = request.nextUrl.pathname.startsWith("/onboarding");

        // If onboarding not completed, redirect to onboarding. An impersonating
        // admin is exempt: the point of the preview is to reach the approved
        // experience, not to be funnelled back into the user's onboarding.
        if (
          !profile.onboardingCompletedAt &&
          !isOnboardingAllowedPath &&
          !isImpersonating
        ) {
          const url = request.nextUrl.clone();
          url.pathname = "/onboarding";
          return NextResponse.redirect(url);
        }

        if (profile.onboardingCompletedAt && !isImpersonating) {
          if (profile.approvalStatus === "pending" && isApprovalRequiredPath) {
            const url = request.nextUrl.clone();
            url.pathname = "/pending-approval";
            return NextResponse.redirect(url);
          }

          if (profile.approvalStatus === "rejected") {
            const url = request.nextUrl.clone();
            url.pathname = "/auth";
            url.searchParams.set("rejected", "true");
            return NextResponse.redirect(url);
          }

          if (profile.approvalStatus === "approved" && isOnboardingPath) {
            const redirectTo = request.nextUrl.searchParams.get("redirectTo");
            if (redirectTo && isValidRedirectUrl(redirectTo.trim())) {
              const url = request.nextUrl.clone();
              const [pathname, search] = redirectTo.split("?");
              url.pathname = pathname;
              url.search = search ? `?${search}` : "";
              return NextResponse.redirect(url);
            }
            const url = request.nextUrl.clone();
            url.pathname = "/dashboard";
            return NextResponse.redirect(url);
          }
        }
      }
    } catch (error) {
      console.error("Middleware: Error checking status:", error);
    }
  }

  // Redirect authenticated users away from auth page
  const isAuthInvitePath = request.nextUrl.pathname.startsWith("/auth/invite");
  if (request.nextUrl.pathname === "/auth" && !isAuthInvitePath) {
    const redirectTo = request.nextUrl.searchParams.get("redirectTo");

    try {
      const profile = await getProfileByUserId(userId);

      if (profile && !profile.onboardingCompletedAt) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding";
        if (redirectTo && isValidRedirectUrl(redirectTo.trim())) {
          url.searchParams.set("redirectTo", redirectTo);
        } else {
          url.searchParams.delete("redirectTo");
        }
        return NextResponse.redirect(url);
      }

      if (profile?.approvalStatus === "pending") {
        const url = request.nextUrl.clone();
        url.pathname = "/pending-approval";
        if (redirectTo && isValidRedirectUrl(redirectTo.trim())) {
          url.searchParams.set("redirectTo", redirectTo);
        } else {
          url.searchParams.delete("redirectTo");
        }
        return NextResponse.redirect(url);
      }

      if (profile?.approvalStatus === "rejected") {
        return response;
      }
    } catch (error) {
      console.error("Middleware: Error checking profile for auth redirect:", error);
    }

    if (redirectTo && isValidRedirectUrl(redirectTo)) {
      const url = request.nextUrl.clone();
      const [pathname, search] = redirectTo.split("?");
      url.pathname = pathname;
      url.search = search ? `?${search}` : "";
      return NextResponse.redirect(url);
    }

    // Check role for redirect
    try {
      const roleData = await getUserRoleByUserId(userId);

      const url = request.nextUrl.clone();
      if (roleData?.role === "superadmin") {
        url.pathname = "/admin";
      } else {
        url.pathname = "/dashboard";
      }
      return NextResponse.redirect(url);
    } catch {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  // Redirect approved users away from pending-approval page
  if (request.nextUrl.pathname === "/pending-approval") {
    try {
      const profile = await getProfileByUserId(userId);

      if (profile?.approvalStatus === "approved") {
        const redirectTo = request.nextUrl.searchParams.get("redirectTo");
        if (redirectTo && isValidRedirectUrl(redirectTo.trim())) {
          const url = request.nextUrl.clone();
          const [pathname, search] = redirectTo.split("?");
          url.pathname = pathname;
          url.search = search ? `?${search}` : "";
          return NextResponse.redirect(url);
        }

        const roleData = await getUserRoleByUserId(userId);

        const url = request.nextUrl.clone();
        if (roleData?.role === "superadmin") {
          url.pathname = "/admin";
        } else {
          url.pathname = "/dashboard";
        }
        return NextResponse.redirect(url);
      }
    } catch (error) {
      console.error("Middleware: Error checking approval:", error);
    }
  }

  return response;
}
