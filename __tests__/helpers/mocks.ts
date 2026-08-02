/**
 * Data builders for mocked auth/db values. Note: `vi.mock` factories are
 * hoisted, so each test file declares its own `vi.mock(...)` calls — these
 * builders supply the return values inside them.
 */

export const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";
export const TEST_COMPANY_ID = "00000000-0000-4000-8000-000000000002";

export function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_USER_ID,
    email: "test@example.com",
    emailVerified: true,
    ...overrides,
  };
}

export function mockSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: TEST_USER_ID,
      email: "test@example.com",
      emailVerified: true,
      name: "test",
    },
    session: { id: "session-1", userId: TEST_USER_ID },
    ...overrides,
  };
}

export function mockProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-1",
    userId: TEST_USER_ID,
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    onboardingStep: 5,
    onboardingCompletedAt: new Date("2026-01-01T00:00:00Z"),
    approvalStatus: "approved",
    ...overrides,
  };
}

export function mockCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_COMPANY_ID,
    userId: TEST_USER_ID,
    companyName: "Test Construction Ltd",
    status: "active",
    verificationStatus: "unverified",
    ...overrides,
  };
}
