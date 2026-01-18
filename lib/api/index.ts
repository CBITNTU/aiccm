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

// Parse JSON from AI response (handles markdown code blocks and comments)
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

  // Strip comments (// and /* */) from JSON before parsing
  // Use a state machine to properly handle strings and comments
  
  // First, remove multi-line comments (/* ... */) - these are easier to handle
  cleanContent = cleanContent.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Then remove single-line comments (// ...) but be careful not to remove // inside strings
  let inString = false;
  let escapeNext = false;
  let result = '';
  let i = 0;
  
  while (i < cleanContent.length) {
    const char = cleanContent[i];
    const nextChar = i + 1 < cleanContent.length ? cleanContent[i + 1] : null;
    
    if (escapeNext) {
      result += char;
      escapeNext = false;
      i++;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      result += char;
      i++;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      result += char;
      i++;
      continue;
    }
    
    // If we see // and we're not in a string, skip to end of line
    if (!inString && char === '/' && nextChar === '/') {
      // Skip to end of line (don't include the // or the rest of the line)
      while (i < cleanContent.length && cleanContent[i] !== '\n' && cleanContent[i] !== '\r') {
        i++;
      }
      // Don't add the newline either - just skip it
      if (i < cleanContent.length && (cleanContent[i] === '\n' || cleanContent[i] === '\r')) {
        i++;
        if (i < cleanContent.length && cleanContent[i] === '\n' && cleanContent[i - 1] === '\r') {
          i++;
        }
      }
      continue;
    }
    
    result += char;
    i++;
  }
  
  cleanContent = result.trim();
  
  // Clean up any trailing commas before closing braces/brackets
  cleanContent = cleanContent.replace(/,(\s*[}\]])/g, '$1');
  
  // Aggressive fallback: Remove any remaining // comments that might have slipped through
  // This handles cases where comments appear after commas, colons, or values
  // We do this by finding // that's not inside quotes (simplified check)
  let finalResult = '';
  let inString2 = false;
  let escapeNext2 = false;
  
  for (let j = 0; j < cleanContent.length; j++) {
    const char = cleanContent[j];
    const nextChar = j + 1 < cleanContent.length ? cleanContent[j + 1] : null;
    
    if (escapeNext2) {
      finalResult += char;
      escapeNext2 = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext2 = true;
      finalResult += char;
      continue;
    }
    
    if (char === '"') {
      inString2 = !inString2;
      finalResult += char;
      continue;
    }
    
    // Skip // comments that aren't in strings
    if (!inString2 && char === '/' && nextChar === '/') {
      // Skip to end of line
      while (j < cleanContent.length && cleanContent[j] !== '\n' && cleanContent[j] !== '\r') {
        j++;
      }
      continue;
    }
    
    finalResult += char;
  }
  
  cleanContent = finalResult.trim();
  
  // Final cleanup: remove trailing commas
  cleanContent = cleanContent.replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(cleanContent);
  } catch (error) {
    // If parsing still fails, log the problematic content for debugging
    if (error instanceof SyntaxError) {
      console.error("JSON parsing failed after comment stripping:");
      console.error("Error:", error.message);
      console.error("Content (first 500 chars):", cleanContent.substring(0, 500));
      // Try one more time with aggressive comment removal
      const aggressiveClean = cleanContent
        .replace(/\/\/[^\n\r]*/g, '') // Remove any remaining // comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove any remaining /* */ comments
        .replace(/,(\s*[}\]])/g, '$1'); // Clean trailing commas
      try {
        return JSON.parse(aggressiveClean);
      } catch (e2) {
        console.error("Aggressive cleaning also failed");
        throw error; // Throw original error
      }
    }
    throw error;
  }
}
