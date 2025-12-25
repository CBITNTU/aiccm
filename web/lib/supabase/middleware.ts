import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

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
    "/admin",
    "/pending-approval",
  ];

  // Paths that pending users can access (subset of protected paths)
  const pendingAllowedPaths = [
    "/pending-approval",
    "/profile",
  ];

  // Paths that require full approval (redirect pending users)
  const approvalRequiredPaths = [
    "/dashboard",
    "/onboarding",
    "/tenders",
    "/directory",
    "/companies",
    "/company",
    "/vo",
    "/admin",
  ];

  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  const isPendingAllowedPath = pendingAllowedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  const isApprovalRequiredPath = approvalRequiredPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Redirect unauthenticated users from protected paths to /auth
  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    return NextResponse.redirect(url);
  }

  // For authenticated users, check approval status
  if (user && isApprovalRequiredPath) {
    try {
      // Check user's approval status from profiles table
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("approval_status")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Middleware: Error fetching profile:", error);
        // If we can't fetch profile, allow access (fail open for existing users)
        // This handles cases where the profile might not exist yet
      } else if (profile) {
        // If user is pending, redirect to pending-approval page
        if (profile.approval_status === "pending") {
          const url = request.nextUrl.clone();
          url.pathname = "/pending-approval";
          return NextResponse.redirect(url);
        }

        // If user is rejected, redirect to auth with signout
        // (The auth page will handle showing the rejection message)
        if (profile.approval_status === "rejected") {
          const url = request.nextUrl.clone();
          url.pathname = "/auth";
          url.searchParams.set("rejected", "true");
          return NextResponse.redirect(url);
        }
      }
    } catch (error) {
      console.error("Middleware: Error checking approval status:", error);
      // Fail open - allow access if we can't check status
    }
  }

  // Redirect authenticated users away from auth page (but not /auth/invite for accepting invitations)
  const isAuthInvitePath = request.nextUrl.pathname.startsWith("/auth/invite");
  if (user && request.nextUrl.pathname === "/auth" && !isAuthInvitePath) {
    // First check their approval status
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("approval_status")
        .eq("user_id", user.id)
        .single();

      if (profile?.approval_status === "pending") {
        const url = request.nextUrl.clone();
        url.pathname = "/pending-approval";
        return NextResponse.redirect(url);
      }

      if (profile?.approval_status === "rejected") {
        // Let them stay on auth page to see rejection message
        return supabaseResponse;
      }
    } catch (error) {
      console.error("Middleware: Error checking approval for auth redirect:", error);
    }

    // Approved users: check role and redirect accordingly
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
        // Check role and redirect accordingly
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
      console.error("Middleware: Error checking approval for pending page:", error);
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
