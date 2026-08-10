import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";

const sessionState = vi.hoisted(() => ({ userId: "" }));

// The route's auth is exercised against a real seeded user — only the session
// cookie lookup is stubbed. isCompanyMember and all queries hit the real DB.
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: sessionState.userId,
          email: "verify-owner@example.com",
          emailVerified: true,
        },
      })),
    },
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  getPlatformName: () => "TNDRX Test",
  getPlatformUrl: (path = "") => `http://localhost:3000${path}`,
}));

import { GET, POST } from "@/app/api/companies/[companyId]/verification/route";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { companies, companyVerificationRequests } from "@/lib/db/schema/app";
import { makeRequest, readJson, routeParams } from "../helpers/request";
import { resetDb } from "../helpers/dbReset";

describe("company verification request flow (real database)", () => {
  let userId: string;
  let companyId: string;
  let incompleteCompanyId: string;
  let foreignCompanyId: string;

  beforeAll(async () => {
    await resetDb();

    const [owner] = await db
      .insert(user)
      .values({ name: "Verify Owner", email: "verify-owner@example.com" })
      .returning({ id: user.id });
    userId = owner.id;
    sessionState.userId = userId;

    const rows = await db
      .insert(companies)
      .values([
        {
          userId,
          companyName: "Verified Builders Ltd",
          contactEmail: "info@verified-builders.example",
          contactPhone: "+44 20 7946 0000",
          websiteUrl: "https://verified-builders.example",
          address: "1 Test Street, London",
          postcode: "SW1A 1AA",
          description: "We build things",
          keyCapabilities: "Groundworks, steel frames",
        },
        {
          userId,
          companyName: "Incomplete Ltd",
          contactEmail: "info@incomplete.example",
          websiteUrl: "https://incomplete.example",
          // no phone, no address
        },
        {
          // owned by no one — the session user has no access
          companyName: "Someone Else Ltd",
          contactEmail: "info@else.example",
        },
      ])
      .returning({ id: companies.id });
    companyId = rows[0].id;
    incompleteCompanyId = rows[1].id;
    foreignCompanyId = rows[2].id;
  });

  function post(id: string, notes?: string) {
    return POST(
      makeRequest(`/api/companies/${id}/verification`, {
        method: "POST",
        json: notes !== undefined ? { notes } : undefined,
      }),
      routeParams({ companyId: id }),
    );
  }

  it("creates a pending verification request and flips the company status", async () => {
    const { status, body } = await readJson(
      await post(companyId, "Please verify us"),
    );

    expect(status).toBe(200);
    const request = body.verificationRequest as Record<string, unknown>;
    expect(request.status).toBe("pending");
    expect(request.submittedBy).toBe(userId);
    expect(request.submissionNotes).toBe("Please verify us");

    const dbRequests = await db
      .select()
      .from(companyVerificationRequests)
      .where(eq(companyVerificationRequests.companyId, companyId));
    expect(dbRequests).toHaveLength(1);
    expect(dbRequests[0].status).toBe("pending");
    expect(dbRequests[0].requestType).toBe("initial_verification");
    expect(dbRequests[0].companySnapshot).toMatchObject({
      companyName: "Verified Builders Ltd",
      contactEmail: "info@verified-builders.example",
      websiteUrl: "https://verified-builders.example",
      keyCapabilities: "Groundworks, steel frames",
    });

    const [company] = await db
      .select({ verificationStatus: companies.verificationStatus })
      .from(companies)
      .where(eq(companies.id, companyId));
    expect(company.verificationStatus).toBe("pending_verification");
  });

  it("rejects a second request while one is pending (400)", async () => {
    const { status, body } = await readJson(await post(companyId));

    expect(status).toBe(400);
    expect(body.error).toBe("A verification request is already pending");

    const dbRequests = await db
      .select()
      .from(companyVerificationRequests)
      .where(eq(companyVerificationRequests.companyId, companyId));
    expect(dbRequests).toHaveLength(1);
  });

  it("GET reports the pending status and latest request", async () => {
    const { status, body } = await readJson(
      await GET(
        makeRequest(`/api/companies/${companyId}/verification`),
        routeParams({ companyId }),
      ),
    );

    expect(status).toBe(200);
    expect(body.verificationStatus).toBe("pending_verification");
    expect(body.hasPendingChanges).toBe(false);
    expect((body.latestRequest as Record<string, unknown>).status).toBe(
      "pending",
    );
  });

  it("rejects submission when required company fields are missing (400)", async () => {
    const { status, body } = await readJson(await post(incompleteCompanyId));

    expect(status).toBe(400);
    expect(body.error).toContain("Missing required fields");
    expect(body.error).toContain("Phone");
    expect(body.error).toContain("Address");

    const dbRequests = await db
      .select()
      .from(companyVerificationRequests)
      .where(eq(companyVerificationRequests.companyId, incompleteCompanyId));
    expect(dbRequests).toHaveLength(0);
  });

  it("rejects users without access to the company (401)", async () => {
    const { status, body } = await readJson(await post(foreignCompanyId));

    expect(status).toBe(401);
    expect(body.error).toBe("No access to this company");
  });
});
