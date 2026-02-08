/**
 * Escape a string for safe use in HTML (e.g. email templates).
 * Prevents XSS when interpolating user- or DB-sourced content.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
