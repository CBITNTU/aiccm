import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import OpenAI from "openai";
import type { Database } from "@/lib/supabase/types";

// Standard API response helper
export function apiResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}

// Error response helper
export function apiError(
  message: string,
  status: number = 500,
  details?: string
): NextResponse {
  return NextResponse.json(
    { error: message, ...(details && { details }) },
    { status }
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
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore in API routes - cookies can't be set after response starts
          }
        },
      },
    }
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
    }
  );
}

// Get authenticated user from request
export async function getAuthenticatedUser(request: NextRequest) {
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

// Check if user has admin role
export async function checkAdminRole(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.role === "admin";
}

// OpenAI client singleton
let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// OpenAI chat completion helper
export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: options.model || "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 500,
  });

  return response.choices[0]?.message?.content || "";
}

// Parse JSON from AI response (handles markdown code blocks)
export function parseAIJsonResponse<T>(content: string): T {
  let cleanContent = content.trim();

  // Remove markdown code blocks
  const codeBlockMatch = cleanContent.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    cleanContent = codeBlockMatch[1].trim();
  } else {
    // Try to extract JSON object or array
    const jsonMatch = cleanContent.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      cleanContent = jsonMatch[0];
    }
  }

  return JSON.parse(cleanContent);
}
