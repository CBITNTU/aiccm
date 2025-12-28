import { NextRequest } from "next/server";
import {
  createAdminClient,
  createApiClient,
  apiResponse,
  apiError,
} from "@/lib/api";
import {
  sendEmail,
  getVerificationResendEmailSubject,
  getVerificationResendEmailHtml,
  getPlatformUrl,
} from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    // Get the current user from the session
    const supabase = await createApiClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return apiError("Unauthorized", 401);
    }

    // Check if already verified
    if (user.email_confirmed_at) {
      return apiError("Email is already verified", 400);
    }

    if (!user.email) {
      return apiError("No email address found", 400);
    }

    // Get user's name from profile
    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from("profiles")
      .select("first_name, last_name")
      .eq("user_id", user.id)
      .single();

    const userName = profile
      ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
      : "User";

    // Generate a magic link - this works for existing users
    // When clicked, it will log them in and confirm their email
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: user.email,
        options: {
          redirectTo: getPlatformUrl("/auth/callback"),
        },
      });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Failed to generate verification link:", linkError);
      return apiError("Failed to generate verification link", 500);
    }

    // Send the verification email via Resend
    const emailResult = await sendEmail({
      to: user.email,
      subject: getVerificationResendEmailSubject(),
      html: getVerificationResendEmailHtml({
        userName,
        verificationLink: linkData.properties.action_link,
      }),
    });

    if (!emailResult.success) {
      console.error("Failed to send verification email:", emailResult.error);
      return apiError("Failed to send verification email", 500);
    }

    return apiResponse({
      success: true,
      message: "Verification email sent",
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
