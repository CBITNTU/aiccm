import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Singleton instance for client-side use
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getClient() {
  if (typeof window === "undefined") {
    // Don't create client during SSR/build
    return createClient();
  }

  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}
