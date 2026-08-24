/**
 * Object storage abstraction.
 *
 * The app deploys to more than one region (see scripts/deploy-targets.mjs), and
 * Vercel Blob's public CDN is slow-to-unreachable from mainland China. Every
 * caller goes through this interface so a region-appropriate backend can be
 * added in lib/storage/index.ts without touching a single call site.
 */

export interface StoredObject {
  /** Publicly fetchable URL. */
  url: string;
  /** Backend object key — what `delete` expects. */
  key: string;
}

export interface BlobStore {
  /** Whether the backend is configured. False in local dev / CI without a token. */
  readonly isConfigured: boolean;

  put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject>;

  /**
   * Best-effort delete. Never throws: the DB row is the source of truth, an
   * orphaned object costs cents, and a throw here would fail an upload that
   * actually succeeded.
   */
  delete(urlOrKey: string): Promise<void>;

  /** Map a public URL back to its object key. Null when the URL is not ours. */
  keyFromUrl(url: string): string | null;
}
