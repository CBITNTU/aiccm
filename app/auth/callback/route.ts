import { createClient } from "@/lib/supabase/server";
import { isValidRedirectUrl } from "@/lib/utils/redirectUrl";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const nextParam = searchParams.get("next");
  const safeNext = isValidRedirectUrl(nextParam) ? nextParam!.trim() : null;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Check user's onboarding and approval status
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (supabase.from("profiles") as any)
          .select("approval_status, onboarding_completed_at")
          .eq("user_id", user.id)
          .single();

        let next = safeNext ?? "/dashboard";

        // Determine redirect based on user status
        if (!profile?.onboarding_completed_at) {
          // User hasn't completed onboarding
          next = "/onboarding";
        } else if (profile?.approval_status === "pending") {
          // User has completed onboarding but is pending approval
          next = "/pending-approval";
        } else if (profile?.approval_status === "rejected") {
          // User was rejected
          next = "/auth?rejected=true";
        } else {
          // User is approved, check role for default redirect
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .single();

          if (roleData?.role === "superadmin") {
            next = "/admin";
          } else {
            next = safeNext ?? "/dashboard";
          }
        }

        const forwardedHost = request.headers.get("x-forwarded-host");
        const isLocalEnv = process.env.NODE_ENV === "development";

        // Add query param if this was an email verification
        const isEmailVerification = type === "signup" || type === "magiclink";
        const redirectPath = isEmailVerification
          ? `${next}${next.includes("?") ? "&" : "?"}email_verified=true`
          : next;

        if (isLocalEnv) {
          return NextResponse.redirect(`${origin}${redirectPath}`);
        } else if (forwardedHost) {
          return NextResponse.redirect(
            `https://${forwardedHost}${redirectPath}`,
          );
        } else {
          return NextResponse.redirect(`${origin}${redirectPath}`);
        }
      }
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(
    `${origin}/auth?error=Could+not+authenticate+user`,
  );
}
