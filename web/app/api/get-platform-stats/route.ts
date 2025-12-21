import { NextRequest } from "next/server";
import { createAdminClient, apiResponse, apiError } from "@/lib/api";
import type { PlatformStats } from "@/lib/api/types";

export async function GET(request: NextRequest) {
  try {
    console.log("Fetching platform statistics...");

    const supabase = createAdminClient();

    const [companiesRes, tendersRes, matchesRes, projectsRes] =
      await Promise.all([
        supabase.from("companies").select("*", { count: "exact", head: true }),
        supabase.from("tenders").select("*", { count: "exact", head: true }),
        supabase
          .from("matching_results")
          .select("*", { count: "exact", head: true }),
        supabase
          .from("virtual_organizations")
          .select("*", { count: "exact", head: true }),
      ]);

    console.log("Companies count:", companiesRes.count);
    console.log("Tenders count:", tendersRes.count);
    console.log("Matches count:", matchesRes.count);
    console.log("Projects count:", projectsRes.count);

    const stats: PlatformStats = {
      companies: companiesRes.count || 0,
      tenders: tendersRes.count || 0,
      matches: matchesRes.count || 0,
      projects: projectsRes.count || 0,
    };

    return apiResponse(stats);
  } catch (error) {
    console.error("Error fetching platform stats:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}

// Also support POST for compatibility
export async function POST(request: NextRequest) {
  return GET(request);
}
