import { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { getAuthenticatedUser, apiError } from "./index";

/**
 * Require authentication. Returns the user or throws a structured error.
 */
export async function requireAuth(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (error || !user) {
    throw new AuthError("Unauthorized");
  }
  return { user };
}

/**
 * Parse and validate request JSON against a Zod schema.
 * Returns typed data or throws a ValidationError with details.
 */
export async function validateBody<T>(
  request: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Invalid JSON body");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      "Invalid request body",
      result.error.message,
    );
  }
  return result.data;
}

/**
 * Trim and truncate text input to a maximum length.
 */
export function sanitizeTextInput(text: string, maxLength: number): string {
  return text.trim().slice(0, maxLength);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value is a well-formed UUID.
 *
 * Every id in this schema is a `uuid` column, and Postgres rejects a malformed
 * one with `22P02 invalid input syntax for type uuid` — which surfaces as a 500
 * rather than the 400/404 the caller deserves. Guard route params and body ids
 * with this before they reach `eq()` / `inArray()`.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Escape LIKE/ILIKE special chars (%, _, \) so user input is treated as literal.
 * Use before interpolating into Supabase .or() or .ilike() to prevent injection.
 */
export function sanitizeLikeParam(text: string, maxLength = 200): string {
  const trimmed = text.trim().slice(0, maxLength);
  return trimmed
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Validate a URL: must be HTTPS, must not point to private/internal IPs.
 * Returns the validated URL string or throws.
 */
export function validateUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError("Invalid URL format");
  }

  if (parsed.protocol !== "https:") {
    throw new ValidationError("Only HTTPS URLs are allowed");
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block private/internal hostnames
  const blocked = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "metadata.google.internal",
    "169.254.169.254",
  ];
  if (blocked.includes(hostname)) {
    throw new ValidationError("Internal URLs are not allowed");
  }

  // Block private IP ranges
  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
    throw new ValidationError("Private IP addresses are not allowed");
  }
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)) {
    throw new ValidationError("Private IP addresses are not allowed");
  }

  return url;
}

/**
 * Check if a user has access to a company — either as the owner (user_id)
 * or as an approved team member (company_members table).
 */
export async function isCompanyMember(
  userId: string,
  companyId: string,
): Promise<boolean> {
  const { getCompanyOwner, getApprovedMembership } = await import("@/lib/db/queries");

  // Check ownership first (fast path)
  const ownerId = await getCompanyOwner(companyId);
  if (ownerId === userId) return true;

  // Check approved team membership
  const membership = await getApprovedMembership(userId, companyId);
  return !!membership;
}

/**
 * Get all company IDs a user has access to — owned companies + approved memberships.
 * Returns an array of company ID strings.
 */
export async function getUserCompanyIds(userId: string): Promise<string[]> {
  const { getOwnedCompanyIds, getApprovedMemberCompanyIds } = await import("@/lib/db/queries");

  const [owned, memberships] = await Promise.all([
    getOwnedCompanyIds(userId),
    getApprovedMemberCompanyIds(userId),
  ]);

  const ids = new Set<string>([...owned, ...memberships]);
  return Array.from(ids);
}

/** Thrown when authentication is required but missing/invalid. */
export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

/** Thrown when request validation fails. */
export class ValidationError extends Error {
  details?: string;
  constructor(message: string, details?: string) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

/**
 * Standard error handler for API routes.
 * Converts known error types to appropriate HTTP responses.
 */
export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return apiError(error.message, 401);
  }
  if (error instanceof ValidationError) {
    return apiError(error.message, 400, error.details);
  }

  console.error("Unhandled API error:", error);
  return apiError("Internal server error", 500);
}
