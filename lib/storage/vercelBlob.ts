import { put, del } from "@vercel/blob";
import type { BlobStore, StoredObject } from "./types";

const LOG = "[storage:vercelBlob]";

const HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * One year. Safe because pathnames are content-hashed by the caller, so the
 * bytes behind a given URL never change — a replacement mints a new URL rather
 * than poisoning the CDN with a stale object under the old one.
 */
const CACHE_MAX_AGE = 31_536_000;

/**
 * Read at call time, not at module load: Next reloads .env.local into the
 * running dev process, and the unit tests set the variable per-test.
 *
 * Passing this explicitly is NOT redundant. @vercel/blob resolves credentials
 * in the order `token` option → OIDC → BLOB_READ_WRITE_TOKEN, and it takes the
 * OIDC branch whenever BLOB_STORE_ID is set and a Vercel OIDC token can be
 * minted — which is exactly the state `vercel env pull` plus a logged-in CLI
 * leaves a dev machine in. The store is not OIDC-enabled, so that branch fails
 * with "Access denied" while a perfectly valid token sits unused in the env.
 */
function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

export const vercelBlobStore: BlobStore = {
  get isConfigured() {
    return !!blobToken();
  },

  async put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject> {
    // @vercel/blob's PutBody does not accept a bare Uint8Array. Buffer.from
    // over the same backing memory is a view, not a copy.
    const body = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const blob = await put(key, body, {
      access: "public",
      contentType,
      // Deterministic path: the caller already content-hashes the key, so a
      // random suffix would only defeat the "identical re-upload is a no-op"
      // property and leak an object on every save.
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: CACHE_MAX_AGE,
      token: blobToken(),
    });
    return { url: blob.url, key };
  },

  async delete(urlOrKey: string): Promise<void> {
    if (!urlOrKey || !this.isConfigured) return;
    try {
      // Only ever delete from our own store. logoUrl is DB-sourced, but this
      // guards against a legacy or imported row holding a third-party URL.
      if (urlOrKey.startsWith("http")) {
        if (!new URL(urlOrKey).hostname.endsWith(HOST_SUFFIX)) return;
      }
      await del(urlOrKey, { token: blobToken() });
    } catch (error) {
      console.error(`${LOG} delete failed (non-fatal):`, error);
    }
  },

  keyFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith(HOST_SUFFIX)) return null;
      return parsed.pathname.replace(/^\//, "") || null;
    } catch {
      return null;
    }
  },
};
