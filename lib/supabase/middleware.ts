import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isValidRedirectUrl } from "@/lib/utils/redirectUrl";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Skip auth check if env vars are not set (during build)
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes - redirect to /auth if not authenticated
  const protectedPaths = [
    "/dashboard",
    "/profile",
    "/onboarding",
    "/tenders",
    "/directory",
    "/companies",
    "/company",
    "/vo",
    "/projects",
    "/my-companies",
    "/admin",
    "/pending-approval",
  ];

  // Paths that pending users can access (subset of protected paths)
  const pendingAllowedPaths = [
    "/pending-approval",
    "/profile",
    "/onboarding",
    "/tenders",
    "/directory",
  ];

  // Paths that onboarding users can access (browse while completing onboarding)
  const onboardingAllowedPaths = ["/onboarding", "/tenders", "/directory"];

  // Paths that require full approval (redirect pending users)
  const approvalRequiredPaths = [
    "/dashboard",
    "/onboarding",
    "/companies",
    "/company",
    "/vo",
    "/projects",
    "/admin",
  ];

  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  const _isPendingAllowedPath = pendingAllowedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );
  void _isPendingAllowedPath;

  const isOnboardingAllowedPath = onboardingAllowedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  const isApprovalRequiredPath = approvalRequiredPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  // Redirect unauthenticated users from protected paths to /auth
  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    // Preserve the original URL as redirectTo parameter
    const originalUrl = request.nextUrl.pathname + request.nextUrl.search;
    url.searchParams.set("redirectTo", originalUrl);
    return NextResponse.redirect(url);
  }

  // For authenticated users, check onboarding and approval status
  if (user && isProtectedPath) {
    try {
      // Check user's profile including onboarding status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile, error } = await (supabase.from("profiles") as any)
        .select("approval_status, onboarding_step, onboarding_completed_at")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Middleware: Error fetching profile:", error);
        // If we can't fetch profile, allow access (fail open for existing users)
        // This handles cases where the profile might not exist yet
      } else if (profile) {
        const isOnboardingPath =
          request.nextUrl.pathname.startsWith("/onboarding");
        const _isPendingApprovalPath =
          request.nextUrl.pathname.startsWith("/pending-approval");
        void _isPendingApprovalPath;

        // If onboarding not completed, redirect to onboarding
        // (unless on an allowed path like /onboarding, /tenders, /directory)
        if (!profile.onboarding_completed_at && !isOnboardingAllowedPath) {
          const url = request.nextUrl.clone();
          url.pathname = "/onboarding";
          return NextResponse.redirect(url);
        }

        // If onboarding is complete, check approval status
        if (profile.onboarding_completed_at) {
          // If user is pending approval and trying to access restricted paths
          if (profile.approval_status === "pending" && isApprovalRequiredPath) {
            const url = request.nextUrl.clone();
            url.pathname = "/pending-approval";
            return NextResponse.redirect(url);
          }

          // If user is rejected, redirect to auth with signout
          if (profile.approval_status === "rejected") {
            const url = request.nextUrl.clone();
            url.pathname = "/auth";
            url.searchParams.set("rejected", "true");
            return NextResponse.redirect(url);
          }

          // If user is approved but on /onboarding, redirect to their destination
          if (profile.approval_status === "approved" && isOnboardingPath) {
            // Check for redirectTo parameter
            const redirectTo = request.nextUrl.searchParams.get("redirectTo");

            if (redirectTo && isValidRedirectUrl(redirectTo.trim())) {
              const url = request.nextUrl.clone();
              const [pathname, search] = redirectTo.split("?");
              url.pathname = pathname;
              url.search = search ? `?${search}` : "";
              return NextResponse.redirect(url);
            }

            // Fallback to dashboard
            const url = request.nextUrl.clone();
            url.pathname = "/dashboard";
            return NextResponse.redirect(url);
          }
        }
      }
    } catch (error) {
      console.error("Middleware: Error checking status:", error);
      // Fail open - allow access if we can't check status
    }
  }

  // Redirect authenticated users away from auth page (but not /auth/invite for accepting invitations)
  const isAuthInvitePath = request.nextUrl.pathname.startsWith("/auth/invite");
  if (user && request.nextUrl.pathname === "/auth" && !isAuthInvitePath) {
    // Get redirectTo parameter if present
    const redirectTo = request.nextUrl.searchParams.get("redirectTo");

    // Check their profile status
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase.from("profiles") as any)
        .select("approval_status, onboarding_completed_at")
        .eq("user_id", user.id)
        .single();

      // If onboarding not completed, redirect to onboarding
      if (profile && !profile.onboarding_completed_at) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding";
        // Preserve redirectTo for after onboarding completes
        if (redirectTo && isValidRedirectUrl(redirectTo.trim())) {
          url.searchParams.set("redirectTo", redirectTo);
        } else {
          url.searchParams.delete("redirectTo");
        }
        return NextResponse.redirect(url);
      }

      if (profile?.approval_status === "pending") {
        const url = request.nextUrl.clone();
        url.pathname = "/pending-approval";
        // Preserve redirectTo for after approval
        if (redirectTo && isValidRedirectUrl(redirectTo.trim())) {
          url.searchParams.set("redirectTo", redirectTo);
        } else {
          url.searchParams.delete("redirectTo");
        }
        return NextResponse.redirect(url);
      }

      if (profile?.approval_status === "rejected") {
        // Let them stay on auth page to see rejection message
        return supabaseResponse;
      }
    } catch (error) {
      console.error(
        "Middleware: Error checking profile for auth redirect:",
        error,
      );
    }

    // Approved users: redirect to redirectTo if valid, otherwise check role
    if (redirectTo && isValidRedirectUrl(redirectTo)) {
      const url = request.nextUrl.clone();
      // Parse the redirectTo URL to extract pathname and search params
      const [pathname, search] = redirectTo.split("?");
      url.pathname = pathname;
      url.search = search ? `?${search}` : "";
      return NextResponse.redirect(url);
    }

    // Fallback: check role and redirect accordingly
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    const url = request.nextUrl.clone();
    if (roleData?.role === "superadmin") {
      url.pathname = "/admin";
    } else {
      url.pathname = "/dashboard";
    }
    return NextResponse.redirect(url);
  }

  // Redirect approved users away from pending-approval page
  if (user && request.nextUrl.pathname === "/pending-approval") {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("approval_status")
        .eq("user_id", user.id)
        .single();

      if (profile?.approval_status === "approved") {
        // Check for redirectTo parameter
        const redirectTo = request.nextUrl.searchParams.get("redirectTo");

        if (redirectTo && isValidRedirectUrl(redirectTo.trim())) {
          const url = request.nextUrl.clone();
          const [pathname, search] = redirectTo.split("?");
          url.pathname = pathname;
          url.search = search ? `?${search}` : "";
          return NextResponse.redirect(url);
        }

        // Fallback: check role and redirect accordingly
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        const url = request.nextUrl.clone();
        if (roleData?.role === "superadmin") {
          url.pathname = "/admin";
        } else {
          url.pathname = "/dashboard";
        }
        return NextResponse.redirect(url);
      }
    } catch (error) {
      console.error(
        "Middleware: Error checking approval for pending page:",
        error,
      );
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
