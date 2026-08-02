import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { companyMembers } from "@/lib/db/schema/app";
import {
  createProfile,
  createCompany,
  createCompanyMember,
  upsertCompanyMember,
  updateCompanyStatus,
  getCompanyOwner,
  getApprovedMembership,
  getOwnedCompanyIds,
  getApprovedMemberCompanyIds,
} from "@/lib/db/queries";
import { getUserCompanyIds } from "@/lib/api/validation";
import { resetDb } from "../helpers/dbReset";

describe("lib/db/queries company helpers (real database)", () => {
  let ownerId: string;
  let memberId: string;
  let companyId: string;

  beforeAll(async () => {
    await resetDb();
    // Plain inserts — no Better Auth / bcrypt needed for these helpers.
    const rows = await db
      .insert(user)
      .values([
        { name: "Owner", email: "owner@example.com" },
        { name: "Member", email: "member@example.com" },
      ])
      .returning({ id: user.id });
    ownerId = rows[0].id;
    memberId = rows[1].id;
  });

  it("createProfile returns a pending profile at onboarding step 1", async () => {
    const profile = await createProfile(ownerId, "owner@example.com");

    expect(profile.userId).toBe(ownerId);
    expect(profile.email).toBe("owner@example.com");
    expect(profile.approvalStatus).toBe("pending");
    expect(profile.onboardingStep).toBe(1);
    expect(profile.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("createCompany persists and returns the row with defaults", async () => {
    const company = await createCompany({
      userId: ownerId,
      companyName: "Query Test Construction Ltd",
      postcode: "SW1A 1AA",
    });

    expect(company.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(company.companyName).toBe("Query Test Construction Ltd");
    expect(company.userId).toBe(ownerId);
    expect(company.status).toBe("draft");
    expect(company.verificationStatus).toBe("unverified");
    companyId = company.id;
  });

  it("createCompanyMember inserts a membership row", async () => {
    const member = await createCompanyMember({
      companyId,
      userId: memberId,
      role: "member",
      status: "approved",
      invitedBy: ownerId,
    });

    expect(member.companyId).toBe(companyId);
    expect(member.userId).toBe(memberId);
    expect(member.role).toBe("member");
    expect(member.status).toBe("approved");
    expect(member.invitedBy).toBe(ownerId);
  });

  it("getCompanyOwner returns the owning user id", async () => {
    expect(await getCompanyOwner(companyId)).toBe(ownerId);
    expect(
      await getCompanyOwner("00000000-0000-4000-8000-0000000000ff"),
    ).toBeNull();
  });

  it("getApprovedMembership finds approved members only", async () => {
    const membership = await getApprovedMembership(memberId, companyId);
    expect(membership).toEqual({ id: expect.any(String) });

    // The owner has no company_members row — ownership is not membership.
    expect(await getApprovedMembership(ownerId, companyId)).toBeNull();
  });

  it("getOwnedCompanyIds / getApprovedMemberCompanyIds split by access type", async () => {
    expect(await getOwnedCompanyIds(ownerId)).toEqual([companyId]);
    expect(await getOwnedCompanyIds(memberId)).toEqual([]);

    expect(await getApprovedMemberCompanyIds(memberId)).toEqual([companyId]);
    expect(await getApprovedMemberCompanyIds(ownerId)).toEqual([]);
  });

  it("getUserCompanyIds merges owned + member company ids", async () => {
    expect(await getUserCompanyIds(ownerId)).toEqual([companyId]);
    expect(await getUserCompanyIds(memberId)).toEqual([companyId]);
  });

  it("updateCompanyStatus updates matching rows and returns the row", async () => {
    const updated = await updateCompanyStatus(
      { id: companyId, userId: ownerId },
      { status: "active" },
    );
    expect(updated?.status).toBe("active");

    // No filters at all is a guarded no-op
    expect(await updateCompanyStatus({}, { status: "draft" })).toBeNull();

    // Non-matching filter combination updates nothing
    expect(
      await updateCompanyStatus(
        { id: companyId, status: "does-not-exist" },
        { status: "draft" },
      ),
    ).toBeNull();
  });

  it("upsertCompanyMember updates the existing row instead of duplicating", async () => {
    const upserted = await upsertCompanyMember({
      companyId,
      userId: memberId,
      role: "admin",
      status: "approved",
      approvedBy: ownerId,
      approvedAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(upserted.role).toBe("admin");
    expect(upserted.approvedBy).toBe(ownerId);

    const rows = await db
      .select()
      .from(companyMembers)
      .where(eq(companyMembers.companyId, companyId));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("admin");
  });
});
