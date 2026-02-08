/**
 * Validate a redirect path to prevent open redirect attacks.
 * Only allows relative paths; rejects protocol-relative (//) and /auth.
 */
export function isValidRedirectUrl(url: string | null): boolean {
  if (url == null || typeof url !== "string" || url.trim() === "") return false;
  const path = url.trim();
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.startsWith("/auth")) return false;
  return true;
}
