import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import {
  companies,
  curatedMatches,
  matchingResults,
  tenders,
} from "@/lib/db/schema/app";
import { getCurationOverlay } from "@/lib/services/curatedMatches";
import { resetDb } from "../helpers/dbReset";

/**
 * The curated overlay against a real database.
 *
 * The interesting parts here can't be mocked: that `expires_at` is evaluated by
 * Postgres rather than by JS, that the unique constraint reopens an existing
 * curation instead of failing, and that deleting a company or tender takes its
 * curations with it.
 */
describe("curated matches (real database)", () => {
  let companyId: string;
  let openTenderId: string;
  let otherTenderId: string;

  beforeAll(async () => {
    await resetDb();

    const [owner] = await db
      .insert(user)
      .values({ name: "Owner", email: "curation-owner@example.com" })
      .returning({ id: user.id });

    const [company] = await db
      .insert(companies)
      .values({ companyName: "Curation Co", userId: owner.id })
      .returning({ id: companies.id });
    companyId = company.id;

    const inserted = await db
      .insert(tenders)
      .values([
        { title: "Roof works", buyer: "Leeds Council", status: "open" },
        { title: "Bridge survey", buyer: "York Council", status: "open" },
      ])
      .returning({ id: tenders.id });
    openTenderId = inserted[0].id;
    otherTenderId = inserted[1].id;
  });

  beforeEach(async () => {
    await db.delete(curatedMatches);
    await db.delete(matchingResults);
  });

  it("returns only published, unexpired curations", async () => {
    const hour = 60 * 60 * 1000;
    await db.insert(curatedMatches).values([
      { companyId, tenderId: openTenderId, status: "published", curatedScore: 90 },
      {
        companyId,
        tenderId: otherTenderId,
        status: "published",
        curatedScore: 80,
        // Expiry is enforced by Postgres `now()`, not by application code.
        expiresAt: new Date(Date.now() - hour),
      },
    ]);

    const overlay = await getCurationOverlay(companyId);

    expect([...overlay.keys()]).toEqual([openTenderId]);
    expect(overlay.get(openTenderId)?.curatedScore).toBe(90);
  });

  it("excludes drafts and archived curations", async () => {
    await db.insert(curatedMatches).values([
      { companyId, tenderId: openTenderId, status: "draft", curatedScore: 90 },
      { companyId, tenderId: otherTenderId, status: "archived", curatedScore: 90 },
    ]);

    expect((await getCurationOverlay(companyId)).size).toBe(0);
  });

  it("keeps a future expiry live", async () => {
    await db.insert(curatedMatches).values({
      companyId,
      tenderId: openTenderId,
      status: "published",
      curatedScore: 77,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    expect((await getCurationOverlay(companyId)).size).toBe(1);
  });

  it("reopens an existing curation rather than failing on the unique key", async () => {
    await db.insert(curatedMatches).values({
      companyId,
      tenderId: openTenderId,
      status: "archived",
      curatedScore: 60,
    });

    // Mirrors the create route: re-curating something previously archived has
    // to bring the record back, not 500 on a constraint violation.
    await db
      .insert(curatedMatches)
      .values({ companyId, tenderId: openTenderId, status: "draft" })
      .onConflictDoUpdate({
        target: [curatedMatches.companyId, curatedMatches.tenderId],
        set: { status: "draft", updatedAt: new Date() },
      });

    const rows = await db
      .select()
      .from(curatedMatches)
      .where(
        and(
          eq(curatedMatches.companyId, companyId),
          eq(curatedMatches.tenderId, openTenderId),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("draft");
    // The previously agreed score survives the reopen.
    expect(rows[0].curatedScore).toBe(60);
  });

  it("cascades away with the tender it curates", async () => {
    const [tender] = await db
      .insert(tenders)
      .values({ title: "Temporary", buyer: "Nobody", status: "open" })
      .returning({ id: tenders.id });

    await db.insert(curatedMatches).values({
      companyId,
      tenderId: tender.id,
      status: "published",
      curatedScore: 90,
    });

    await db.delete(tenders).where(eq(tenders.id, tender.id));

    const rows = await db
      .select()
      .from(curatedMatches)
      .where(eq(curatedMatches.tenderId, tender.id));
    expect(rows).toHaveLength(0);
  });

  it("does not leak one company's curations into another's overlay", async () => {
    const [other] = await db
      .insert(companies)
      .values({ companyName: "Unrelated Co" })
      .returning({ id: companies.id });

    await db.insert(curatedMatches).values({
      companyId,
      tenderId: openTenderId,
      status: "published",
      curatedScore: 90,
    });

    expect((await getCurationOverlay(other.id)).size).toBe(0);
  });
});
