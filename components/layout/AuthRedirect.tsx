"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Client component that detects auth hash tokens in the URL
 * and redirects to /auth to handle them properly.
 *
 * This handles the case where Supabase redirects to the root
 * with hash tokens after email verification.
 */
export function AuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      // Redirect to /auth with the hash tokens
      // The auth page will handle setting the session
      router.replace(`/auth${hash}`);
    }
  }, [router]);

  return null;
}
