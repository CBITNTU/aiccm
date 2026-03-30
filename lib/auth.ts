import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { sendEmail, getPlatformName } from "@/lib/email";
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
    nextCookies(),
  ],
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || "http://localhost:3000",
    // Also trust the Vercel deployment URL for preview deployments (VERCEL_URL is a bare
    // hostname without protocol — prefix https:// so Better-Auth accepts it as a valid origin)
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],
});

export type Session = typeof auth.$Infer.Session;
