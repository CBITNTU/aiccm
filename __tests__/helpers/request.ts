import { NextRequest } from "next/server";

interface MakeRequestOptions {
  method?: string;
  json?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  searchParams?: Record<string, string>;
}

/**
 * Builds a NextRequest for invoking route handlers directly in tests.
 */
export function makeRequest(
  url: string,
  { method = "GET", json, headers = {}, cookies, searchParams }: MakeRequestOptions = {},
): NextRequest {
  const fullUrl = new URL(url, "http://localhost:3000");
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      fullUrl.searchParams.set(key, value);
    }
  }

  const requestHeaders = new Headers(headers);
  if (json !== undefined) {
    requestHeaders.set("content-type", "application/json");
  }
  if (cookies) {
    requestHeaders.set(
      "cookie",
      Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    );
  }

  return new NextRequest(fullUrl, {
    method,
    headers: requestHeaders,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
}

/**
 * Reads status + parsed JSON body from a route handler's Response.
 */
export async function readJson(response: Response): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  return { status: response.status, body: await response.json() };
}

/**
 * Next 16 dynamic route context: params arrive as a Promise.
 */
export function routeParams<T extends Record<string, string>>(params: T): {
  params: Promise<T>;
} {
  return { params: Promise.resolve(params) };
}
