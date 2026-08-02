import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * All app + auth tables that integration tests write to. Reference/lookup
 * tables (company_capabilities_ref, competency_taxonomy_seed, markets,
 * standards_ref) are deliberately excluded so seeded reference data — if any
 * is ever loaded into the test database — survives between suites. Their
 * junction tables ARE truncated (tests may link rows to them).
 */
const TABLES = [
  // Better Auth
  "user",
  "session",
  "account",
  "verification",
  "organization",
  "member",
  "invitation",
  // App
  "profiles",
  "user_roles",
  "companies",
  "company_members",
  "company_join_requests",
  "team_invitations",
  "tenders",
  "matching_results",
  "taxonomies",
  "company_taxonomies",
  "tender_taxonomies",
  "company_capabilities",
  "company_markets",
  "company_standards",
  "virtual_organizations",
  "vo_members",
  "partnership_recommendations",
  "partnership_messages",
  "events",
  "processing_queue",
  "batch_jobs",
  "sync_state",
  "platform_settings",
  "company_verification_requests",
  "competency_change_requests",
  "demo_matching_results",
];

/**
 * Truncate every table integration tests touch, resetting sequences and
 * cascading to any dependent rows. Safe to call from beforeEach/beforeAll —
 * the integration project runs files sequentially in a single fork.
 */
export async function resetDb(): Promise<void> {
  const tableList = TABLES.map((t) => `"${t}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`));
}
