import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin, customSession } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { sendEmail, getPlatformName } from "@/lib/email";
import { getEmailLocale, getEmailTranslator } from "@/lib/email/i18n";
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
      // Localize to the signing-up user's chosen language (NEXT_LOCALE cookie,
      // clamped to the deployment's allowed locales). Runs in the signup/resend
      // request context, so the cookie is available.
      const locale = await getEmailLocale();
      const t = getEmailTranslator(locale);
      const platformName = getPlatformName();
      await sendEmail({
        to: user.email,
        subject: t("verification.subject", { platformName }),
        html: `
          <h2>${t("verification.heading", { platformName })}</h2>
          <p>${t("verification.instruction")}</p>
          <p><a href="${verifyUrl}">${t("verification.button")}</a></p>
          <p>${t("verification.ignore", { platformName })}</p>
        `,
      });
    },
  },

  plugins: [
    organization(),
    // App roles live in `user_roles`. This plugin authorizes off its own
    // `user.role` column and only accepts roles declared in its access-control
    // config, so app superadmins are mirrored onto its built-in "admin" role
    // (see migration 0014 and /api/admin/users/[userId]/role). `user_roles`
    // stays the app's source of truth.
    //
    // Impersonation lets an admin preview a pending account exactly as its
    // owner will see it. The session is deliberately short-lived, and the
    // plugin refuses to impersonate another admin by default.
    admin({
      impersonationSessionDuration: 60 * 60,
    }),
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
