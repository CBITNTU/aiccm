import { NextRequest, NextResponse } from "next/server";
import type { AuthenticatedApiUser } from "@/lib/api/types";

/** Model ids supported for matching (demo and production). */
export const MATCHING_MODEL_IDS = {
  "gpt-5-nano": "gpt-5-nano",
  "ollama/qwen2.5:7b": "ollama/qwen2.5:7b",
  "ollama/qwen2.5:3b": "ollama/qwen2.5:3b",
} as const;
export type MatchingModelId = keyof typeof MATCHING_MODEL_IDS;

// Standard API response helper
export function apiResponse<T>(
  data: T,
  status: number = 200,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json(data, { status, ...(headers && { headers }) });
}

// Error response helper
export function apiError(
  message: string,
  status: number = 500,
  details?: string,
): NextResponse {
  return NextResponse.json(
    { error: message, ...(details && { details }) },
    { status },
  );
}

// Get authenticated user from request (Better Auth only)
export async function getAuthenticatedUser(request: NextRequest) {
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (session?.user) {
      const user: AuthenticatedApiUser = {
        id: session.user.id,
        email: session.user.email,
        emailVerified: session.user.emailVerified ?? null,
      };

      return {
        user,
        error: null,
      };
    }
  } catch (err) {
    console.error("Better Auth session error:", err);
  }

  return { user: null, error: "Unauthorized" };
}

// Check if user has superadmin role via Drizzle
export async function checkSuperadminRole(userId: string): Promise<boolean> {
  const { userHasRole } = await import("@/lib/db/queries");
  return userHasRole(userId, "superadmin");
}
