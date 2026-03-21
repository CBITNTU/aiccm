import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { profiles, companyJoinRequests, companies } from "@/lib/db/schema/app";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Get profile info
    const profileResult = await db
      .select({
        approvalStatus: profiles.approvalStatus,
        signupType: profiles.signupType,
      })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    const profile = profileResult[0] ?? null;

    // Check for join request if applicable
    const joinRequestResult = await db
      .select({
        status: companyJoinRequests.status,
        companyNameRequested: companyJoinRequests.companyNameRequested,
      })
      .from(companyJoinRequests)
      .where(eq(companyJoinRequests.userId, user.id))
      .orderBy(desc(companyJoinRequests.createdAt))
      .limit(1);

    const joinRequest = joinRequestResult[0] ?? null;

    // Check for owned company name
    let companyName: string | null = joinRequest?.companyNameRequested || null;
    if (!companyName) {
      const companyResult = await db
        .select({ companyName: companies.companyName })
        .from(companies)
        .where(eq(companies.userId, user.id))
        .limit(1);
      companyName = companyResult[0]?.companyName || null;
    }

    return apiResponse({
      approvalStatus: profile?.approvalStatus || "pending",
      signupType: profile?.signupType || null,
      companyName,
      joinRequestStatus: joinRequest?.status || null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
