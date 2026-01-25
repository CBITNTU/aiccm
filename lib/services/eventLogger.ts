import { createAdminClient } from "@/lib/api";
import type { Json } from "@/lib/supabase/types";

const supabase = createAdminClient();

export type EventActionType =
  // Authentication
  | "user_login"
  | "user_logout"
  | "user_signup"
  | "user_email_verified"
  | "password_reset_requested"
  | "password_reset_completed"
  // Company actions
  | "company_created"
  | "company_updated"
  | "company_deleted"
  | "company_capabilities_updated"
  | "company_member_invited"
  | "company_member_approved"
  | "company_member_removed"
  // Tender actions
  | "tender_viewed"
  | "tender_bookmarked"
  | "tender_unbookmarked"
  | "tender_applied"
  | "tender_imported"
  | "tender_ai_generated"
  // Matching actions
  | "matching_started"
  | "matching_triggered"
  | "matching_completed"
  | "matching_result_viewed"
  // Profile actions
  | "profile_updated"
  | "profile_viewed"
  // Project/VO actions
  | "project_created"
  | "project_updated"
  | "project_deleted"
  | "project_member_invited"
  | "project_member_joined"
  // Admin actions
  | "admin_user_approved"
  | "admin_user_rejected"
  | "admin_company_approved"
  | "admin_company_rejected"
  | "admin_tender_imported"
  | "admin_tender_ai_regenerated"
  | "admin_taxonomy_updated"
  // Queue/Processing
  | "queue_job_created"
  | "queue_job_completed"
  | "queue_job_failed"
  // System events
  | "system_error"
  | "rate_limit_exceeded"
  | "api_error";

export interface EventLogData {
  actionType: EventActionType;
  userId?: string | null;
  userEmail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestPath?: string | null;
  requestMethod?: string | null;
  status?: "success" | "error" | "warning";
  errorMessage?: string | null;
}

/**
 * Log an event to the audit log
 * This function is safe to call from anywhere - it won't throw errors
 * to avoid breaking the main flow
 */
export async function logEvent(data: EventLogData): Promise<void> {
  try {
    // Get user email if userId is provided but email is not
    let userEmail = data.userEmail;
    if (data.userId && !userEmail) {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(
          data.userId,
        );
        userEmail = userData?.user?.email || null;
      } catch {
        // Ignore errors fetching user email
      }
    }

    const { error } = await supabase.from("events").insert({
      action_type: data.actionType,
      user_id: data.userId || null,
      user_email: userEmail || null,
      entity_type: data.entityType || null,
      entity_id: data.entityId || null,
      details: (data.details || {}) as Record<string, Json>,
      ip_address: data.ipAddress || null,
      user_agent: data.userAgent || null,
      request_path: data.requestPath || null,
      request_method: data.requestMethod || null,
      status: data.status || "success",
      error_message: data.errorMessage || null,
    });

    if (error) {
      // Log to console but don't throw - event logging should never break the app
      console.error("Failed to log event:", error, data);
    }
  } catch (error) {
    // Silently fail - event logging should never break the main flow
    console.error("Error in logEvent:", error);
  }
}

/**
 * Extract IP address and user agent from Next.js request
 */
export function extractRequestInfo(request: {
  headers?: Headers | Record<string, string | string[]>;
  url?: string;
  method?: string;
}): {
  ipAddress: string | null;
  userAgent: string | null;
  requestPath: string | null;
  requestMethod: string | null;
} {
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  let requestPath: string | null = null;
  let requestMethod: string | null = null;

  try {
    const headers = request.headers;
    if (headers) {
      // Check if headers is a Headers object (has .get method) or a plain object
      const isHeadersObject =
        headers instanceof Headers ||
        typeof (headers as any).get === "function";

      // Get IP address (check various headers for proxies)
      let forwardedFor: string | string[] | null = null;
      if (isHeadersObject) {
        forwardedFor = (headers as Headers).get("x-forwarded-for");
      } else {
        forwardedFor =
          (headers as Record<string, string | string[]>)["x-forwarded-for"] ||
          null;
      }

      const forwardedForStr = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor;
      const realIpRaw = isHeadersObject
        ? (headers as Headers).get("x-real-ip")
        : (headers as Record<string, string | string[]>)["x-real-ip"] || null;
      const realIp = Array.isArray(realIpRaw) ? realIpRaw[0] : realIpRaw;

      ipAddress = forwardedForStr?.split(",")[0]?.trim() || realIp || null;

      // Get user agent
      const userAgentRaw = isHeadersObject
        ? (headers as Headers).get("user-agent")
        : (headers as Record<string, string | string[]>)["user-agent"] || null;
      userAgent = Array.isArray(userAgentRaw) ? userAgentRaw[0] : userAgentRaw;

      // Get request method
      requestMethod = request.method || null;
    }

    // Get request path from URL
    if (request.url) {
      try {
        const url = new URL(request.url);
        requestPath = url.pathname;
      } catch {
        requestPath = request.url;
      }
    }
  } catch (error) {
    // Ignore errors in extraction
    console.error("Error extracting request info:", error);
  }

  return { ipAddress, userAgent, requestPath, requestMethod };
}

/**
 * Helper to log events from API routes
 */
export async function logApiEvent(
  request: {
    headers?: Headers | Record<string, string | string[]>;
    url?: string;
    method?: string;
  },
  data: Omit<
    EventLogData,
    "ipAddress" | "userAgent" | "requestPath" | "requestMethod"
  >,
): Promise<void> {
  const requestInfo = extractRequestInfo(request);
  await logEvent({
    ...data,
    ...requestInfo,
  });
}
