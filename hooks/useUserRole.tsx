"use client";

import { authClient } from "@/lib/auth-client";

/**
 * Reads the user's app role from the session. The role now rides on the
 * session response (via the customSession plugin), so no separate request is
 * needed.
 */
export const useUserRole = () => {
  const { data: sessionData, isPending } = authClient.useSession();
  const role = sessionData?.appRole ?? null;

  return { role, loading: isPending, isAdmin: role === "superadmin" };
};
