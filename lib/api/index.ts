import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/types";

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

  return createServerClient<Database>(
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
  return createSupabaseClient<Database>(
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

// Get authenticated user from request
export async function getAuthenticatedUser(_request: NextRequest) {
  const supabase = await createApiClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, supabase, error: error?.message || "Unauthorized" };
  }

  return { user, supabase, error: null };
}

// Check if user has superadmin role
export async function checkSuperadminRole(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "superadmin")
    .limit(1);

  // If we get any results, user has superadmin role
  return !error && data && data.length > 0;
}
