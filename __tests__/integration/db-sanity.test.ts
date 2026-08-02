import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

describe("integration infrastructure", () => {
  it("connects to the dedicated test database", async () => {
    const result = await db.execute(sql`SELECT current_database() AS name`);
    expect(result.rows[0].name).toBe("tndrx_test");
  });

  it("has the schema pushed", async () => {
    const result = await db.execute(
      sql`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    expect(Number(result.rows[0].count)).toBeGreaterThan(10);
  });
});
