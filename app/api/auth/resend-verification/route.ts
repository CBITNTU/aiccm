import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function POST(request: NextRequest) {
  try {
    // Get current user from Better Auth session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return apiError("Unauthorized", 401);
    }

    const user = session.user;

    // Check if already verified
    if (user.emailVerified) {
      return apiError("Email is already verified", 400);
    }

    // Send verification email via Better Auth
    await auth.api.sendVerificationEmail({
      body: {
        email: user.email,
        callbackURL: "/auth/callback",
      },
    });

    await logApiEvent(request, {
      actionType: "email_verification_resent",
      userId: user.id,
      userEmail: user.email,
    }).catch(() => {});

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
