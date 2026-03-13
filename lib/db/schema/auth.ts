import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Better Auth core tables.
 * These are the tables Better Auth expects for its auth system.
 * Column names use camelCase as Better Auth convention.
 */

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  role: text("role").default("user"), // Better Auth admin plugin field
  banned: boolean("banned").default(false),
  banReason: text("banReason"),
  banExpires: timestamp("banExpires", { withTimezone: true }),
});

export const session = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }),
  updatedAt: timestamp("updatedAt", { withTimezone: true }),
});

// Better Auth organization plugin tables

export const organization = pgTable("organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  metadata: text("metadata"),
});

export const member = pgTable("member", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  inviterId: uuid("inviterId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
