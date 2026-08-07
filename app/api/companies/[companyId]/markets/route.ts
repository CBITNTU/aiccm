import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
} from "@/lib/api/validation";
import {
  requireCompanyAccess,
  markCompanyAdminPrepared,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { companyMarkets, markets, companies, companyVerificationRequests } from "@/lib/db/schema/app";
import { localizedName } from "@/lib/taxonomy/localizedName";
import { refreshCompanyEmbedding } from "@/lib/services/embeddingService";
import { eq, and, inArray } from "drizzle-orm";
import type { PendingChanges } from "@/lib/companyFieldCategories";

async function getCompanyMarketsData(companyId: string) {
  return db
    .select({
      id: markets.id,
      name: localizedName(markets.name, markets.nameZh),
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

    await requireCompanyAccess(user.id, companyId);

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

    const access = await requireCompanyAccess(user.id, companyId);
    // Must be in this frame — see enableEmailSuppression's contract.
    suppressEmailForAdminOverride(access, user.id);
    const { adminOverride } = access;

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

    // An admin acting on the user's behalf bypasses the change-review queue.
    if (company?.verificationStatus === "verified" && !adminOverride) {
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

    if (adminOverride) {
      await markCompanyAdminPrepared(companyId, user.id);
    }

    // Markets feed the embedding source — see refreshCompanyEmbedding.
    await refreshCompanyEmbedding(companyId);

    const data = await getCompanyMarketsData(companyId);
    return apiResponse({ markets: data, pendingReview: false });
  } catch (error) {
    return handleApiError(error);
  }
}
