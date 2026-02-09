/* eslint-disable @typescript-eslint/no-explicit-any -- actionType from options */
import { NextRequest, NextResponse } from "next/server";
import { logApiEvent } from "@/lib/services/eventLogger";
import { getAuthenticatedUser } from "@/lib/api";

/**
 * Wrapper for API route handlers that automatically logs requests
 * Use this to wrap your route handlers to ensure all requests are logged
 */
export function withEventLogging<T = unknown>(
  handler: (request: NextRequest, context?: T) => Promise<NextResponse>,
  options?: {
    actionType?: string;
    skipLogging?: boolean; // For routes that don't need logging
  },
) {
  return async (request: NextRequest, context?: T): Promise<NextResponse> => {
    const startTime = Date.now();
    let response: NextResponse = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
    let status: "success" | "error" | "warning" = "success";
    let errorMessage: string | null = null;

    try {
      response = await handler(request, context);

      // Determine status from response
      if (response.status >= 500) {
        status = "error";
      } else if (response.status >= 400) {
        status = "warning";
      }

      // Try to extract error message from response
      if (status !== "success") {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();
          errorMessage = data.error || data.message || null;
        } catch {
          // Ignore if we can't parse the response
        }
      }

      return response;
    } catch (error) {
      status = "error";
      errorMessage = error instanceof Error ? error.message : String(error);

      // Create error response
      response = NextResponse.json(
        { error: errorMessage || "Internal server error" },
        { status: 500 },
      );

      return response;
    } finally {
      // Log the request (unless explicitly skipped)
      if (!options?.skipLogging) {
        try {
          // Get user info if available
          const { user } = await getAuthenticatedUser(request).catch(() => ({
            user: null,
          }));

          const duration = Date.now() - startTime;

          await logApiEvent(request, {
            actionType: (options?.actionType || "api_error") as any, // Allow custom action types for auto-logging
            userId: user?.id || null,
            userEmail: user?.email || null,
            status,
            errorMessage,
            details: {
              statusCode: response.status,
              durationMs: duration,
              path: request.nextUrl.pathname,
              method: request.method,
            },
          });
        } catch (logError) {
          // Don't fail the request if logging fails
          console.error("Failed to log event:", logError);
        }
      }
    }
  };
}
