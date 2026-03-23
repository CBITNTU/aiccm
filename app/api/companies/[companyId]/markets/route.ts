import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyMarkets, markets, companies, companyVerificationRequests } from "@/lib/db/schema/app";
import { eq, and, inArray } from "drizzle-orm";
import type { PendingChanges } from "@/lib/companyFieldCategories";

async function getCompanyMarketsData(companyId: string) {
  return db
    .select({
      id: markets.id,
      name: markets.name,
      parent_id: markets.parentId,
      sort_order: markets.sortOrder,
    })
    .from(companyMarkets)
    .innerJoin(markets, eq(companyMarkets.marketId, markets.id))
    .where(eq(companyMarkets.companyId, companyId));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    const data = await getCompanyMarketsData(companyId);
    return apiResponse({ markets: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    const body = await request.json();
    const { marketIds } = body as { marketIds: string[] };

    // Get current markets
    const current = await db
      .select({ marketId: companyMarkets.marketId })
      .from(companyMarkets)
      .where(eq(companyMarkets.companyId, companyId));

    const currentIds = new Set(current.map((c) => c.marketId));
    const newIds = new Set(marketIds);

    const toRemove = [...currentIds].filter((id) => !newIds.has(id));
    const toAdd = [...newIds].filter((id) => !currentIds.has(id));

    // No changes
    if (toRemove.length === 0 && toAdd.length === 0) {
      const data = await getCompanyMarketsData(companyId);
      return apiResponse({ markets: data, pendingReview: false });
    }

    // Check if company is verified
    const company = await db
      .select({ verificationStatus: companies.verificationStatus, pendingChanges: companies.pendingChanges })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0]);

    if (company?.verificationStatus === "verified") {
      // Check edit lock
      const pendingRequest = await db
        .select({ id: companyVerificationRequests.id })
        .from(companyVerificationRequests)
        .where(
          and(
            eq(companyVerificationRequests.companyId, companyId),
            eq(companyVerificationRequests.requestType, "change_review"),
            eq(companyVerificationRequests.status, "pending"),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (pendingRequest) {
        return apiResponse(
          { error: "Cannot edit markets while a change review is pending. Please wait for admin review." },
          400,
        );
      }

      // Store in pendingChanges
      const pending: PendingChanges = (company.pendingChanges as PendingChanges | null) ?? {
        lastSavedAt: new Date().toISOString(),
      };
      pending.markets = {
        current: [...currentIds],
        proposed: marketIds,
        added: toAdd,
        removed: toRemove,
      };
      pending.lastSavedAt = new Date().toISOString();

      await db
        .update(companies)
        .set({ pendingChanges: pending, updatedAt: new Date() })
        .where(eq(companies.id, companyId));

      return apiResponse({
        pendingReview: true,
        draftSaved: true,
        message: "Market changes saved as draft. Submit for review when ready.",
      });
    }

    // Unverified: apply directly
    if (toRemove.length > 0) {
      await db
        .delete(companyMarkets)
        .where(
          and(
            eq(companyMarkets.companyId, companyId),
            inArray(companyMarkets.marketId, toRemove),
          ),
        );
    }

    if (toAdd.length > 0) {
      await db.insert(companyMarkets).values(
        toAdd.map((marketId) => ({
          companyId,
          marketId,
        })),
      );
    }

    const data = await getCompanyMarketsData(companyId);
    return apiResponse({ markets: data, pendingReview: false });
  } catch (error) {
    return handleApiError(error);
  }
}
