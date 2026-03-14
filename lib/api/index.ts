import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { AuthenticatedApiUser } from "@/lib/api/types";

/** Model ids supported for matching (demo and production). */
export const MATCHING_MODEL_IDS = {
  "gpt-5-nano": "gpt-5-nano",
} as const;
export type MatchingModelId = keyof typeof MATCHING_MODEL_IDS;

// Standard API response helper
export function apiResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
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

// Create authenticated Supabase client for API routes (uses cookies)
export async function createApiClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Ignore in API routes - cookies can't be set after response starts
          }
        },
      },
    },
  );
}

// Create admin Supabase client (bypasses RLS)
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
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
