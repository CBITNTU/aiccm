import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

/**
 * Superadmin action: reset a company's monthly usage (both analysis and matching
 * runs) so it can run again immediately. Non-destructive — instead of deleting
 * audit rows, we stamp `usageResetAt = now()`. Usage is then counted from the
 * later of this instant or the calendar month start (see lib/matchingUsage.ts).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { companyId } = await params;
    const resetAt = new Date();

    const result = await db
      .update(companies)
      .set({ usageResetAt: resetAt })
      .where(eq(companies.id, companyId))
      .returning({
        id: companies.id,
        companyName: companies.companyName,
        usageResetAt: companies.usageResetAt,
      });

    if (result.length === 0) {
      throw new Error("Company not found");
    }

    logApiEvent(request, {
      actionType: "admin_usage_reset",
      userId: user.id,
      entityType: "company",
      entityId: companyId,
      details: {
        companyName: result[0].companyName,
        resetAt: resetAt.toISOString(),
      },
    });

    return apiResponse({
      success: true,
      usageResetAt: result[0].usageResetAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
