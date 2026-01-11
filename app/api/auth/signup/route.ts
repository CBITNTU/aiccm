import { NextRequest } from "next/server";
import { createAdminClient, apiResponse, apiError } from "@/lib/api";
import {
  sendEmail,
  getSignupVerificationEmailSubject,
  getSignupVerificationEmailHtml,
  getPlatformUrl,
} from "@/lib/email";

export interface SignupRequest {
  email: string;
  password: string;
}

export interface SignupResponse {
  success: boolean;
  userId?: string;
  message: string;
}

/**
 * POST /api/auth/signup
 *
 * Simplified signup endpoint that only creates the auth user.
 * All other data (profile, company, etc.) is collected during onboarding.
 *
 * Request body:
 * - email: string (required)
 * - password: string (required)
 *
 * After signup:
 * - User is created with unverified email
 * - Profile is created via database trigger with onboarding_step = 1
 * - Verification email is sent
 * - User can log in immediately and be redirected to onboarding
 */
export async function POST(request: NextRequest) {
  try {
    const body: SignupRequest = await request.json();
    const { email, password } = body;

    // Validate required fields
    if (!email || !password) {
      return apiError("Email and password are required", 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return apiError("Invalid email address", 400);
    }

    // Validate password length
    if (password.length < 6) {
      return apiError("Password must be at least 6 characters", 400);
    }

    const supabase = createAdminClient();

    // Create auth user with Supabase Admin API using generateLink
    // This creates the user with unverified email and returns a verification link
    const { data: linkData, error: authError } =
      await supabase.auth.admin.generateLink({
        type: "signup",
        email,
        password,
        options: {
          redirectTo: getPlatformUrl("/auth/callback"),
          // Don't pass user metadata - profile info collected during onboarding
        },
      });

    if (authError) {
      console.error("Auth user creation error:", authError);
      if (authError.message.includes("already been registered")) {
        return apiError(
          "An account with this email already exists. Please sign in instead.",
          400
        );
      }
      return apiError(authError.message, 400);
    }

    if (!linkData?.user) {
      return apiError("Failed to create user", 500);
    }

    const userId = linkData.user.id;
    const verificationLink = linkData.properties.action_link;

    // Send verification email
    await sendEmail({
      to: email,
      subject: getSignupVerificationEmailSubject(),
      html: getSignupVerificationEmailHtml({ verificationLink }),
    });

    // Return success response
    const response: SignupResponse = {
      success: true,
      userId,
      message: "Account created. Please check your email to verify your address.",
    };

    return apiResponse(response, 201);
  } catch (error) {
    console.error("Signup error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
