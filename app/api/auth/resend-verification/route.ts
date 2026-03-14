import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/api";
import { requireAuth } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { user as authUsersTable } from "@/lib/db/schema/auth";
import { eq } from "drizzle-orm";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const authUser = await db
      .select({ emailVerified: authUsersTable.emailVerified })
      .from(authUsersTable)
      .where(eq(authUsersTable.id, user.id))
      .limit(1);

    // Check if already verified
    if (authUser[0]?.emailVerified) {
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
