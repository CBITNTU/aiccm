import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import {
  requireCompanyAdmin,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { discoverCompanyLogo } from "@/lib/services/companyLogoService";
import { getBlobStore } from "@/lib/storage";

// Worst case is a homepage fetch, an optional web-app manifest fetch and up to
// eight candidate downloads, each with safeFetch's 15s ceiling. In practice the
// first candidate wins and this is one round-trip.
export const maxDuration = 90;

/**
 * Run logo discovery on demand.
 *
 * Synchronous rather than queued: the user pressed a button and is watching a
 * spinner, so they get the answer — including *why* it failed — in the same
 * round-trip. `force` is set because the "never clobber a manual upload" rule
 * exists to protect against automatic overwrites, not against an admin who
 * explicitly asked for this.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const access = await requireCompanyAdmin(user.id, companyId);
    suppressEmailForAdminOverride(access, user.id);

    if (!getBlobStore().isConfigured) {
      return apiResponse({ error: "Logo storage is not configured" }, 503);
    }

    const result = await discoverCompanyLogo(companyId, { force: true });

    // `errors` holds upstream diagnostics (URLs, HTTP codes) — useful in logs,
    // not something to hand back to a company admin.
    return apiResponse({
      ok: result.ok,
      logoUrl: result.logoUrl ?? null,
      reason: result.reason ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
