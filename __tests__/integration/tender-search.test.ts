import { describe, it, expect, beforeAll, vi } from "vitest";

// This suite tests the search SQL, not authentication — stub only the session
// lookup that requireAuth performs via the dynamic @/lib/auth import.
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "searcher@example.com",
          emailVerified: true,
        },
      }),
    },
  },
}));

import { GET } from "@/app/api/tenders/search/route";
import { db } from "@/lib/db";
import { tenders } from "@/lib/db/schema/app";
import { makeRequest, readJson } from "../helpers/request";
import { resetDb } from "../helpers/dbReset";

interface TenderRow {
  id: string;
  title: string;
  status: string | null;
}

function search(searchParams: Record<string, string> = {}) {
  return GET(makeRequest("/api/tenders/search", { searchParams }));
}

describe("GET /api/tenders/search (real database)", () => {
  beforeAll(async () => {
    await resetDb();
    await db.insert(tenders).values([
      {
        title: "Road maintenance 50% framework",
        buyer: "Highways Agency",
        status: "open",
        location: "Manchester",
        budgetMax: 500000,
        deadline: new Date("2026-10-01T00:00:00Z"),
      },
      {
        title: "Building 507 refurbishment",
        buyer: "City Council",
        status: "open",
        location: "Leeds",
        budgetMax: 250000,
        deadline: new Date("2026-11-01T00:00:00Z"),
      },
      {
        title: "School catering services",
        buyer: "Education Trust",
        status: "open",
        location: "Manchester",
        deadline: new Date("2026-12-01T00:00:00Z"),
      },
      {
        title: "Closed archive digitisation",
        buyer: "National Archives",
        status: "closed",
        location: "London",
        deadline: new Date("2026-09-01T00:00:00Z"),
      },
    ]);
  });

  it("excludes closed tenders by default and counts correctly", async () => {
    const { status, body } = await readJson(await search());

    expect(status).toBe(200);
    expect(body.totalCount).toBe(3);
    const titles = (body.tenders as TenderRow[]).map((t) => t.title);
    expect(titles).toHaveLength(3);
    expect(titles).not.toContain("Closed archive digitisation");
  });

  it("returns closed tenders when explicitly filtered by status", async () => {
    const { body } = await readJson(await search({ status: "closed" }));

    expect(body.totalCount).toBe(1);
    expect((body.tenders as TenderRow[])[0].title).toBe(
      "Closed archive digitisation",
    );
  });

  it("matches keyword against title, buyer, and location", async () => {
    const byBuyer = await readJson(await search({ keyword: "Highways" }));
    expect(byBuyer.body.totalCount).toBe(1);
    expect((byBuyer.body.tenders as TenderRow[])[0].title).toBe(
      "Road maintenance 50% framework",
    );

    const byLocation = await readJson(await search({ keyword: "Manchester" }));
    expect(byLocation.body.totalCount).toBe(2);
  });

  it("treats % in the keyword as a literal, not a LIKE wildcard", async () => {
    // Unescaped, "50%" would become ILIKE '%50%%' and also match "Building 507".
    const { body } = await readJson(await search({ keyword: "50%" }));

    expect(body.totalCount).toBe(1);
    const titles = (body.tenders as TenderRow[]).map((t) => t.title);
    expect(titles).toEqual(["Road maintenance 50% framework"]);
  });

  it("paginates while keeping totalCount at the full match count", async () => {
    const page1 = await readJson(
      await search({ pageSize: "2", page: "1", sortBy: "deadline" }),
    );
    expect(page1.body.totalCount).toBe(3);
    expect(page1.body.tenders as TenderRow[]).toHaveLength(2);

    const page2 = await readJson(
      await search({ pageSize: "2", page: "2", sortBy: "deadline" }),
    );
    expect(page2.body.totalCount).toBe(3);
    expect(page2.body.tenders as TenderRow[]).toHaveLength(1);

    // deadline asc: last page holds the latest deadline
    expect((page2.body.tenders as TenderRow[])[0].title).toBe(
      "School catering services",
    );
  });

  it("filters by budgetMax", async () => {
    const { body } = await readJson(await search({ budgetMax: "300000" }));

    expect(body.totalCount).toBe(1);
    expect((body.tenders as TenderRow[])[0].title).toBe(
      "Building 507 refurbishment",
    );
  });
});
