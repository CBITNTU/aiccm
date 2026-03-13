import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { createProfile, createUserRole } from "@/lib/db/queries";
import { logApiEvent } from "@/lib/services/eventLogger";

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
 * Creates a new user via Better Auth, then creates profile + default role via Drizzle.
 * Better Auth's emailVerification.sendOnSignUp config handles sending the verification email.
 */
export async function POST(request: NextRequest) {
  try {
    const body: SignupRequest = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return apiError("Email and password are required", 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return apiError("Invalid email address", 400);
    }

    if (password.length < 6) {
      return apiError("Password must be at least 6 characters", 400);
    }
    if (password.length > 128) {
      return apiError("Password must be between 6 and 128 characters", 400);
    }
    if (password.includes("\0")) {
      return apiError("Invalid password", 400);
    }

    // Create user via Better Auth — this also sends verification email via sendOnSignUp
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: email.split("@")[0], // Better Auth requires name; user updates during onboarding
      },
    });

    if (!result?.user) {
      return apiError("Failed to create user", 500);
    }

    const userId = result.user.id;

    // Create profile + default role via Drizzle (replaces Supabase DB trigger)
    await createProfile(userId, email);
    await createUserRole(userId, "user");

    await logApiEvent(request, {
      actionType: "user_signup",
      userId,
      userEmail: email,
      details: { emailVerified: false },
    });

    const response: SignupResponse = {
      success: true,
      userId,
      message:
        "Account created. Please check your email to verify your address.",
    };

    return apiResponse(response, 201);
  } catch (error) {
    console.error("Signup error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("already") || message.includes("exists")) {
      return apiError(
        "An account with this email already exists. Please sign in instead.",
        400,
      );
    }

    return apiError(message, 500);
  }
}
