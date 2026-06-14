import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin, customSession } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { sendEmail, getPlatformName } from "@/lib/email";
import { getProfileByUserId, getUserRolesByUserId } from "@/lib/db/queries";
import { randomUUID } from "crypto";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
  },

  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password: string) => {
        return bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }: { hash: string; password: string }) => {
        return bcrypt.compare(password, hash);
      },
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      // Replace default callbackURL=/ with /auth/callback for proper post-verification routing
      const verifyUrl = url.replace(
        /callbackURL=[^&]*/,
        `callbackURL=${encodeURIComponent("/auth/callback")}`,
      );
      await sendEmail({
        to: user.email,
        subject: `Verify your email - ${getPlatformName()}`,
        html: `
          <h2>Welcome to ${getPlatformName()}</h2>
          <p>Please verify your email address by clicking the link below:</p>
          <p><a href="${verifyUrl}">Verify Email</a></p>
          <p>If you didn't create an account, you can safely ignore this email.</p>
        `,
      });
    },
  },

  plugins: [
    organization(),
    admin(),
    // Augment the session response with the app role + profile state so the
    // client doesn't need separate /api/user-role and /api/profile/me calls.
    // NOTE: this replaces the get-session response body, so user + session
    // MUST be spread back in.
    customSession(async ({ user, session }) => {
      const [roleRows, profile] = await Promise.all([
        getUserRolesByUserId(user.id),
        getProfileByUserId(user.id),
      ]);

      const appRole =
        roleRows.find((r) => r.role === "superadmin")?.role ??
        roleRows.find((r) => r.role === "sme-owner")?.role ??
        roleRows[0]?.role ??
        null;

      return {
        user,
        session,
        appRole,
        isAdmin: appRole === "superadmin",
        profile: profile
          ? {
              approvalStatus: profile.approvalStatus,
              onboardingCompletedAt:
                profile.onboardingCompletedAt?.toISOString() ?? null,
              firstName: profile.firstName,
              lastName: profile.lastName,
            }
          : null,
      };
    }),
    nextCookies(),
  ],
  secret: process.env.BETTER_AUTH_SECRET,
});

export type Session = typeof auth.$Infer.Session;
