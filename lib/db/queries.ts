import { eq, and, inArray } from "drizzle-orm";
import { db } from "./index";
import {
  profiles,
  userRoles,
  companies,
  companyMembers,
  companyJoinRequests,
  teamInvitations,
  platformSettings,
} from "./schema/app";

/**
 * Get a user's profile by their Better Auth user ID.
 */
export async function getProfileByUserId(userId: string) {
  const result = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Get a user's role from the user_roles table.
 */
export async function getUserRoleByUserId(userId: string) {
  const result = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Get all of a user's roles from the user_roles table.
 * Used to resolve the effective app role (superadmin > sme-owner > first).
 */
export async function getUserRolesByUserId(userId: string) {
  return db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
}

/**
 * Check if a user has a specific role.
 */
export async function userHasRole(userId: string, role: string) {
  const result = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role as "superadmin" | "sme-owner" | "sme-member" | "individual" | "admin" | "user")))
    .limit(1);
  return result.length > 0;
}

/**
 * Create a profile for a new user.
 * Replaces the Supabase database trigger that auto-created profiles on signup.
 */
export async function createProfile(userId: string, email: string) {
  const result = await db
    .insert(profiles)
    .values({
      userId,
      email,
      onboardingStep: 1,
      approvalStatus: "pending",
    })
    .returning();
  return result[0];
}

/**
 * Create a user role entry.
 */
export async function createUserRole(userId: string, role: "superadmin" | "sme-owner" | "sme-member" | "individual" | "admin" | "user" = "user") {
  const result = await db
    .insert(userRoles)
    .values({ userId, role })
    .onConflictDoNothing()
    .returning();
  return result[0] ?? null;
}

/**
 * Update profile fields by user ID.
 */
export async function updateProfileByUserId(
  userId: string,
  updates: Partial<typeof profiles.$inferInsert>,
) {
  const result = await db
    .update(profiles)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(profiles.userId, userId))
    .returning();
  return result[0] ?? null;
}

// ============================================================================
// Companies
// ============================================================================

export async function createCompany(data: typeof companies.$inferInsert) {
  const result = await db.insert(companies).values(data).returning();
  return result[0];
}

export async function updateCompanyStatus(
  filters: { id?: string; userId?: string; status?: string },
  updates: Partial<typeof companies.$inferInsert>,
) {
  const conditions = [];
  if (filters.id) conditions.push(eq(companies.id, filters.id));
  if (filters.userId) conditions.push(eq(companies.userId, filters.userId));
  if (filters.status) conditions.push(eq(companies.status, filters.status));
  if (conditions.length === 0) return null;
  const result = await db
    .update(companies)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(...conditions))
    .returning();
  return result[0] ?? null;
}

// ============================================================================
// Company Members
// ============================================================================

export async function createCompanyMember(data: {
  companyId: string;
  userId: string;
  role: string;
  status: string;
  invitedBy?: string | null;
}) {
  const result = await db
    .insert(companyMembers)
    .values({
      companyId: data.companyId,
      userId: data.userId,
      role: data.role,
      status: data.status,
      invitedBy: data.invitedBy ?? null,
    })
    .returning();
  return result[0];
}

export async function upsertCompanyMember(data: {
  companyId: string;
  userId: string;
  role: string;
  status: string;
  approvedBy?: string | null;
  approvedAt?: Date | null;
}) {
  const result = await db
    .insert(companyMembers)
    .values({
      companyId: data.companyId,
      userId: data.userId,
      role: data.role,
      status: data.status,
      approvedBy: data.approvedBy ?? null,
      approvedAt: data.approvedAt ?? null,
    })
    .onConflictDoUpdate({
      target: [companyMembers.companyId, companyMembers.userId],
      set: {
        role: data.role,
        status: data.status,
        approvedBy: data.approvedBy ?? null,
        approvedAt: data.approvedAt ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return result[0];
}

export async function updateCompanyMemberStatus(
  filters: { userId?: string; companyId?: string; status?: string },
  updates: Partial<typeof companyMembers.$inferInsert>,
) {
  const conditions = [];
  if (filters.userId) conditions.push(eq(companyMembers.userId, filters.userId));
  if (filters.companyId) conditions.push(eq(companyMembers.companyId, filters.companyId));
  if (filters.status) conditions.push(eq(companyMembers.status, filters.status));
  if (conditions.length === 0) return [];
  const result = await db
    .update(companyMembers)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(...conditions))
    .returning();
  return result;
}

// ============================================================================
// User Roles (delete)
// ============================================================================

export async function deleteUserRole(
  userId: string,
  role: "superadmin" | "sme-owner" | "sme-member" | "individual" | "admin" | "user",
) {
  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));
}

// ============================================================================
// Company Join Requests
// ============================================================================

export async function createCompanyJoinRequest(data: {
  userId: string;
  companyId: string;
  companyNameRequested: string;
  message?: string | null;
  status: string;
}) {
  const result = await db
    .insert(companyJoinRequests)
    .values({
      userId: data.userId,
      companyId: data.companyId,
      companyNameRequested: data.companyNameRequested,
      message: data.message ?? null,
      status: data.status,
    })
    .returning();
  return result[0];
}

export async function updateCompanyJoinRequest(
  id: string,
  updates: Partial<typeof companyJoinRequests.$inferInsert>,
) {
  const result = await db
    .update(companyJoinRequests)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(companyJoinRequests.id, id))
    .returning();
  return result[0] ?? null;
}

// ============================================================================
// Team Invitations
// ============================================================================

export async function createTeamInvitation(data: {
  companyId: string;
  email: string;
  tokenHash: string;
  invitedBy: string;
  status: string;
  expiresAt: Date;
}) {
  const result = await db
    .insert(teamInvitations)
    .values({
      companyId: data.companyId,
      email: data.email,
      tokenHash: data.tokenHash,
      invitedBy: data.invitedBy,
      status: data.status,
      expiresAt: data.expiresAt,
    })
    .returning();
  return result[0];
}

export async function acceptTeamInvitation(id: string, userId: string) {
  const result = await db
    .update(teamInvitations)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      acceptedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(teamInvitations.id, id))
    .returning();
  return result[0] ?? null;
}

// ============================================================================
// Company Access Helpers
// ============================================================================

/**
 * Get the owner (user_id) of a company.
 */
export async function getCompanyOwner(companyId: string) {
  const result = await db
    .select({ userId: companies.userId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return result[0]?.userId ?? null;
}

/**
 * Check if a user has an approved membership in a company.
 */
export async function getApprovedMembership(userId: string, companyId: string) {
  const result = await db
    .select({ id: companyMembers.id })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, userId),
        eq(companyMembers.status, "approved"),
      ),
    )
    .limit(1);
  return result[0] ?? null;
}

/**
 * Get a user's role in a company. Returns "admin" for the company owner,
 * or the member's role if they are an approved member, or null if no access.
 */
export async function getCompanyMemberRole(
  userId: string,
  companyId: string,
): Promise<string | null> {
  // Check ownership first — owners are treated as admin
  const ownerId = await getCompanyOwner(companyId);
  if (ownerId === userId) return "admin";

  // Check approved team membership
  const result = await db
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, userId),
        eq(companyMembers.status, "approved"),
      ),
    )
    .limit(1);
  return result[0]?.role ?? null;
}

/**
 * Get all company IDs owned by a user.
 */
export async function getOwnedCompanyIds(userId: string): Promise<string[]> {
  const result = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.userId, userId));
  return result.map((r) => r.id);
}

/**
 * Get all company IDs where user is an approved member.
 */
export async function getApprovedMemberCompanyIds(userId: string): Promise<string[]> {
  const result = await db
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, userId),
        eq(companyMembers.status, "approved"),
      ),
    );
  return result.map((r) => r.companyId);
}

// ============================================================================
// Platform Settings
// ============================================================================

/**
 * Get platform settings by keys.
 */
export async function getPlatformSettingsByKeys(keys: string[]) {
  const result = await db
    .select()
    .from(platformSettings)
    .where(inArray(platformSettings.key, keys));
  return result;
}

/**
 * Upsert a platform setting.
 */
export async function upsertPlatformSetting(key: string, value: string) {
  const result = await db
    .insert(platformSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value, updatedAt: new Date() },
    })
    .returning();
  return result[0];
}
