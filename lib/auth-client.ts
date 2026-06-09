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
} = authClient;
