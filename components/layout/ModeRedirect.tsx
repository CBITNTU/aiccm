"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * Client component that handles the ?mode=create query parameter
 * on the root page. If user is authenticated and approved,
 * redirects to /my-company/new to create a new company.
 */
export function ModeRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || checked) return;

    const mode = searchParams.get("mode");
    if (mode !== "create") {
      setChecked(true);
      return;
    }

    // Check if user is authenticated
    const checkAuthAndRedirect = async () => {
      try {
        const session = await authClient.getSession();
        const user = session.data?.user;

        if (user) {
          // User is authenticated, redirect to new company page
          router.replace("/my-company/new");
        } else {
          // User is not authenticated, redirect to auth page
          // After auth, they can manually navigate to add company
          router.replace("/auth");
        }
      } catch (error) {
        console.error("ModeRedirect: Error checking auth", error);
      } finally {
        setChecked(true);
      }
    };

    checkAuthAndRedirect();
  }, [router, searchParams, checked]);

  return null;
}
