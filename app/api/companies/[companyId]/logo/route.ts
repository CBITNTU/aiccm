import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError, ValidationError } from "@/lib/api/validation";
import {
  requireCompanyAdmin,
  markCompanyAdminPrepared,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { companies, companyVerificationRequests } from "@/lib/db/schema/app";
import { eq, and } from "drizzle-orm";
import { getBlobStore, companyLogoKey } from "@/lib/storage";
import {
  sniffImageKind,
  readImageDimensions,
  IMAGE_MIME,
  IMAGE_EXT,
  type ImageKind,
} from "@/lib/images/sniff";
import { logApiEvent } from "@/lib/services/eventLogger";
import type { PendingChanges } from "@/lib/companyFieldCategories";

// Generous enough for a blob round-trip on a cold function; well under the
// platform default so a hung upstream still surfaces as our error, not theirs.
export const maxDuration = 30;

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MIN_LOGO_PX = 32;
const MAX_LOGO_PX = 4096;

/** Uploads are raster-only and animated GIF is not a brand mark — see lib/images/sniff.ts. */
const UPLOAD_KINDS: ReadonlySet<ImageKind> = new Set<ImageKind>(["png", "jpeg", "webp"]);

/**
 * NOTE ON IMPERSONATION: `lib/auth/middleware.ts` rejects every non-GET request
 * from an impersonated session with a 403 before this handler runs, so a
 * superadmin viewing-as a user cannot change their logo. That is intended — the
 * admin path is `adminOverride` on the superadmin's own session, not
 * impersonation. Do not "fix" it by exempting this route.
 */

interface LogoTarget {
  verificationStatus: string;
  pendingChanges: PendingChanges | null;
  logoUrl: string | null;
}

async function loadCompany(companyId: string): Promise<LogoTarget | null> {
  const row = await db
    .select({
      verificationStatus: companies.verificationStatus,
      pendingChanges: companies.pendingChanges,
      logoUrl: companies.logoUrl,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .then((rows) => rows[0]);

  if (!row) return null;
  return {
    verificationStatus: row.verificationStatus,
    pendingChanges: (row.pendingChanges as PendingChanges | null) ?? null,
    logoUrl: row.logoUrl,
  };
}

/** Mirrors the guard in the company PUT route: no edits while a review is open. */
async function hasOpenChangeReview(companyId: string): Promise<boolean> {
  const row = await db
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
  return !!row;
}

/**
 * Stage a logo change on a verified company instead of applying it.
 *
 * Returns the pendingChanges to persist, and the URL of any previously staged
 * logo blob that this supersedes so the caller can delete it — a staged object
 * has no other owner, so missing this leaks it.
 */
function stageLogoChange(
  existing: PendingChanges | null,
  currentUrl: string | null,
  proposedUrl: string | null,
): { pendingChanges: PendingChanges | null; supersededPendingUrl: string | null } {
  const pendingChanges: PendingChanges =
    existing ?? { lastSavedAt: new Date().toISOString() };
  if (!pendingChanges.scalarFields) pendingChanges.scalarFields = {};

  const supersededPendingUrl = pendingChanges.scalarFields.logoUrl?.proposed ?? null;

  if (proposedUrl === currentUrl) {
    // Reverted to the live value — drop the draft entirely.
    delete pendingChanges.scalarFields.logoUrl;
  } else {
    pendingChanges.scalarFields.logoUrl = { current: currentUrl, proposed: proposedUrl };
  }

  const hasScalar = Object.keys(pendingChanges.scalarFields).length > 0;
  const hasRelations =
    pendingChanges.capabilities || pendingChanges.markets || pendingChanges.standards;

  if (!hasScalar && !hasRelations) {
    return { pendingChanges: null, supersededPendingUrl };
  }
  pendingChanges.lastSavedAt = new Date().toISOString();
  return { pendingChanges, supersededPendingUrl };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const access = await requireCompanyAdmin(user.id, companyId);
    // Must be in this frame — see enableEmailSuppression's contract.
    suppressEmailForAdminOverride(access, user.id);

    const store = getBlobStore();
    if (!store.isConfigured) {
      return apiResponse({ error: "Logo storage is not configured" }, 503);
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("No file provided");
    }

    // Checked before reading: File.size from formData() is authoritative, and
    // buffering a 50MB body just to discover it is too big is the whole cost we
    // are avoiding.
    if (file.size > MAX_LOGO_BYTES) {
      throw new ValidationError("Logo must be 2 MB or smaller");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // The browser's Content-Type and the filename are both caller-controlled.
    // The sniffed kind is what decides the stored MIME type and extension.
    const kind = sniffImageKind(bytes);
    if (!kind || !UPLOAD_KINDS.has(kind)) {
      throw new ValidationError("Logo must be a PNG, JPEG or WebP image");
    }

    const dimensions = readImageDimensions(bytes, kind);
    if (!dimensions) {
      throw new ValidationError("Could not read that image");
    }
    if (dimensions.width < MIN_LOGO_PX || dimensions.height < MIN_LOGO_PX) {
      throw new ValidationError(`Logo must be at least ${MIN_LOGO_PX}x${MIN_LOGO_PX} pixels`);
    }
    if (dimensions.width > MAX_LOGO_PX || dimensions.height > MAX_LOGO_PX) {
      throw new ValidationError(`Logo must be at most ${MAX_LOGO_PX}x${MAX_LOGO_PX} pixels`);
    }

    const company = await loadCompany(companyId);
    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    // Same rule as the company PUT route: a verified company's reviewable edits
    // are staged, unless a superadmin is acting on the owner's behalf.
    const useReviewQueue =
      company.verificationStatus === "verified" && !access.adminOverride;

    if (useReviewQueue && (await hasOpenChangeReview(companyId))) {
      return apiResponse(
        {
          error:
            "Cannot change the logo while a change review is pending. Please wait for admin review.",
        },
        400,
      );
    }

    const key = companyLogoKey(companyId, bytes, IMAGE_EXT[kind], useReviewQueue ? "pending" : "live");
    const stored = await store.put(key, bytes, IMAGE_MIME[kind]);
    const now = new Date();

    if (useReviewQueue) {
      const { pendingChanges, supersededPendingUrl } = stageLogoChange(
        company.pendingChanges,
        company.logoUrl,
        stored.url,
      );
      await db
        .update(companies)
        .set({ pendingChanges, updatedAt: now })
        .where(eq(companies.id, companyId));

      if (supersededPendingUrl && supersededPendingUrl !== stored.url) {
        await store.delete(supersededPendingUrl);
      }

      await logApiEvent(request, {
        actionType: "company_updated",
        userId: user.id,
        entityType: "company",
        entityId: companyId,
        details: { logo: "staged_for_review" },
      });

      return apiResponse({ logoUrl: stored.url, pending: true });
    }

    await db
      .update(companies)
      .set({
        logoUrl: stored.url,
        logoSource: access.adminOverride ? "admin" : "upload",
        logoUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(companies.id, companyId));

    // Identical bytes hash to the same key, so the "previous" object IS the one
    // we just wrote — deleting it would leave a dangling URL.
    if (company.logoUrl && company.logoUrl !== stored.url) {
      await store.delete(company.logoUrl);
    }

    if (access.adminOverride) {
      await markCompanyAdminPrepared(companyId, user.id);
    }

    await logApiEvent(request, {
      actionType: "company_updated",
      userId: user.id,
      entityType: "company",
      entityId: companyId,
      details: { logo: "uploaded" },
    });

    return apiResponse({ logoUrl: stored.url, pending: false });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const access = await requireCompanyAdmin(user.id, companyId);
    suppressEmailForAdminOverride(access, user.id);

    const company = await loadCompany(companyId);
    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    const store = getBlobStore();
    const useReviewQueue =
      company.verificationStatus === "verified" && !access.adminOverride;

    if (useReviewQueue) {
      if (await hasOpenChangeReview(companyId)) {
        return apiResponse(
          {
            error:
              "Cannot change the logo while a change review is pending. Please wait for admin review.",
          },
          400,
        );
      }
      const { pendingChanges, supersededPendingUrl } = stageLogoChange(
        company.pendingChanges,
        company.logoUrl,
        null,
      );
      await db
        .update(companies)
        .set({ pendingChanges, updatedAt: new Date() })
        .where(eq(companies.id, companyId));

      if (supersededPendingUrl) await store.delete(supersededPendingUrl);

      return apiResponse({ logoUrl: company.logoUrl, pending: true });
    }

    await db
      .update(companies)
      .set({
        logoUrl: null,
        logoSource: null,
        logoUpdatedAt: null,
        // Cleared too: an explicit delete is a request to start over, so a later
        // discovery run should be allowed to try this company again.
        logoDiscoveryAttemptedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    if (company.logoUrl) await store.delete(company.logoUrl);

    await logApiEvent(request, {
      actionType: "company_updated",
      userId: user.id,
      entityType: "company",
      entityId: companyId,
      details: { logo: "removed" },
    });

    return apiResponse({ logoUrl: null, pending: false });
  } catch (error) {
    return handleApiError(error);
  }
}
