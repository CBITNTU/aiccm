import { describe, it, expect, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { companyColumnsNoEmbedding, companyListColumns } from "@/lib/db/columns";
import { REVIEWABLE_SCALAR_FIELDS } from "@/lib/companyFieldCategories";
import { resetDb } from "../helpers/dbReset";

/**
 * Guards the hand-written 0017 migration against the Drizzle schema.
 *
 * This matters more here than it normally would: drizzle-kit snapshots in this
 * repo stop at 0006, so `drizzle-kit generate` cannot diff the schema and
 * nothing else would catch the SQL and the TypeScript drifting apart.
 */
describe("company logo columns (real database)", () => {
  let companyId: string;

  beforeAll(async () => {
    await resetDb();
    const [row] = await db
      .insert(companies)
      .values({ companyName: "Logo Test Ltd", websiteUrl: "https://example.com" })
      .returning({ id: companies.id });
    companyId = row.id;
  });

  it("round-trips all four logo columns through Drizzle", async () => {
    const now = new Date();
    await db
      .update(companies)
      .set({
        logoUrl: "https://store.public.blob.vercel-storage.com/company-logos/x/abc.png",
        logoSource: "upload",
        logoUpdatedAt: now,
        logoDiscoveryAttemptedAt: now,
      })
      .where(eq(companies.id, companyId));

    const [row] = await db
      .select({
        logoUrl: companies.logoUrl,
        logoSource: companies.logoSource,
        logoUpdatedAt: companies.logoUpdatedAt,
        logoDiscoveryAttemptedAt: companies.logoDiscoveryAttemptedAt,
      })
      .from(companies)
      .where(eq(companies.id, companyId));

    expect(row.logoUrl).toContain("company-logos/");
    expect(row.logoSource).toBe("upload");
    expect(row.logoUpdatedAt).toBeInstanceOf(Date);
    expect(row.logoDiscoveryAttemptedAt).toBeInstanceOf(Date);
  });

  it("defaults every logo column to null on insert", async () => {
    const [fresh] = await db
      .insert(companies)
      .values({ companyName: "No Logo Ltd" })
      .returning({
        logoUrl: companies.logoUrl,
        logoSource: companies.logoSource,
        logoUpdatedAt: companies.logoUpdatedAt,
        logoDiscoveryAttemptedAt: companies.logoDiscoveryAttemptedAt,
      });

    expect(fresh.logoUrl).toBeNull();
    expect(fresh.logoSource).toBeNull();
    expect(fresh.logoUpdatedAt).toBeNull();
    expect(fresh.logoDiscoveryAttemptedAt).toBeNull();
  });

  it("rejects a logo_source outside the three known writers", async () => {
    // Only 'upload' | 'website' | 'admin' are valid. A typo here would silently
    // break discoverCompanyLogo's "never clobber a manual upload" rule.
    let caught: unknown;
    try {
      await db
        .insert(companies)
        .values({ companyName: "Bad Source Ltd", logoSource: "bogus" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    // Drizzle wraps the driver error; the constraint name is on the cause.
    const cause = (caught as { cause?: { constraint?: string } }).cause;
    expect(cause?.constraint).toBe("companies_logo_source_check");
  });

  it("exposes logoUrl through both shared column projections", async () => {
    // These derive from getTableColumns(companies) minus an omit list, so a
    // logo column must flow through automatically. If someone adds logoUrl to
    // an omit list, every list view silently loses its avatars.
    expect(companyColumnsNoEmbedding).toHaveProperty("logoUrl");
    expect(companyListColumns).toHaveProperty("logoUrl");
  });

  it("treats logoUrl as a reviewable field", async () => {
    expect(REVIEWABLE_SCALAR_FIELDS).toContain("logoUrl");
  });

  it("promotes a staged logo when a pending change is applied", async () => {
    const staged = "https://store.public.blob.vercel-storage.com/company-logos/x/pending/def.png";

    // Stage it the way the logo route does.
    await db
      .update(companies)
      .set({
        logoUrl: "https://store.public.blob.vercel-storage.com/company-logos/x/live.png",
        pendingChanges: {
          scalarFields: { logoUrl: { current: "…/live.png", proposed: staged } },
          lastSavedAt: new Date().toISOString(),
        },
      })
      .where(eq(companies.id, companyId));

    // Apply it the way the verification review route does.
    await db
      .update(companies)
      .set({ logoUrl: staged, pendingChanges: null })
      .where(eq(companies.id, companyId));

    const [row] = await db
      .select({ logoUrl: companies.logoUrl, pendingChanges: companies.pendingChanges })
      .from(companies)
      .where(eq(companies.id, companyId));

    expect(row.logoUrl).toBe(staged);
    expect(row.pendingChanges).toBeNull();
  });

  it("has the partial index the backfill selection relies on", async () => {
    const result = await db.execute(
      sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'companies_logo_pending_idx'`,
    );
    const rows = (result as unknown as { rows: { indexdef: string }[] }).rows ?? result;
    expect(rows).toHaveLength(1);
    expect((rows as { indexdef: string }[])[0].indexdef).toContain("logo_url IS NULL");
  });
});
