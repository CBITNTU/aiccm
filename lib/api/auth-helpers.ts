import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export interface AuthResult {
  userId: string;
  email: string;
}

/**
 * Better Auth only requireAuth.
 * Returns { userId, email } or throws an AuthError.
 */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (session?.user) {
      return {
        userId: session.user.id,
        email: session.user.email,
      };
    }
  } catch {
    // Session not found
  }

  throw new AuthError("Unauthorized");
}

/** Thrown when authentication is required but missing/invalid. */
export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}
