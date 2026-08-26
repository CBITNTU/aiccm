import { createHash } from "node:crypto";
import type { BlobStore } from "./types";
import { vercelBlobStore } from "./vercelBlob";

export type { BlobStore, StoredObject } from "./types";

/**
 * The single seam for swapping object storage backends.
 *
 * Today this is always Vercel Blob. When the CN deployment target needs its own
 * store (Vercel Blob's CDN is slow-to-unreachable from mainland China), branch
 * here on the deployment profile and return a different BlobStore — no call
 * site changes.
 */
export function getBlobStore(): BlobStore {
  return vercelBlobStore;
}

/**
 * Content-addressed key for a company logo.
 *
 * Hashing the bytes is what makes cache invalidation a non-problem: a new logo
 * is a new URL, so nothing stale is ever served and we can set a one-year
 * max-age honestly. Re-uploading identical bytes resolves to the same key and
 * is a genuine no-op.
 *
 * `pending` stages an upload awaiting admin review on a verified company; it
 * must be garbage-collected when the review is approved, rejected or discarded.
 */
export function companyLogoKey(
  companyId: string,
  bytes: Uint8Array,
  ext: string,
  variant: "live" | "pending" = "live",
): string {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const prefix = variant === "pending" ? "pending/" : "";
  return `company-logos/${companyId}/${prefix}${hash}.${ext}`;
}
