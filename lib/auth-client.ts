import { createAuthClient } from "better-auth/react";
import {
  organizationClient,
  adminClient,
  customSessionClient,
} from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    adminClient(),
    customSessionClient<typeof auth>(),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  // Password recovery: `requestPasswordReset` emails a reset link,
  // `resetPassword` consumes the token from that link.
  requestPasswordReset,
  resetPassword,
} = authClient;
