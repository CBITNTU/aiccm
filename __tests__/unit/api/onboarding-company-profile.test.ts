import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { POST } from "@/app/api/onboarding/company-profile/route";
import { AuthError, requireAuth } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { createCompany, createCompanyMember } from "@/lib/db/queries";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { mockCompany, mockUser, TEST_COMPANY_ID, TEST_USER_ID } from "@/__tests__/helpers/mocks";
import { makeChain } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/api/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/validation")>()),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
}));

vi.mock("@/lib/db/queries", () => ({
  createCompany: vi.fn(),
  createCompanyMember: vi.fn(),
}));

const mockedRequireAuth = requireAuth as unknown as Mock;
const mockedSelect = db.select as unknown as Mock;
const mockedCreateCompany = createCompany as unknown as Mock;
const mockedCreateCompanyMember = createCompanyMember as unknown as Mock;

function queueDuplicateCheck(rows: unknown[]) {
  mockedSelect.mockImplementationOnce(() => makeChain(() => rows));
}

describe("POST /api/onboarding/company-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireAuth.mockResolvedValue({ user: mockUser() });
    mockedCreateCompany.mockResolvedValue(mockCompany());
    mockedCreateCompanyMember.mockResolvedValue({ id: "member-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockedRequireAuth.mockRejectedValue(new AuthError("Unauthorized"));

    const response = await POST(
      makeRequest("/api/onboarding/company-profile", {
        method: "POST",
        json: { companyName: "Acme Construction" },
      }),
    );
    const { status, body } = await readJson(response);

    expect(status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(mockedSelect).not.toHaveBeenCalled();
    expect(mockedCreateCompany).not.toHaveBeenCalled();
  });

  it("returns 400 when companyName is missing (Zod refine)", async () => {
    const response = await POST(
      makeRequest("/api/onboarding/company-profile", {
        method: "POST",
        json: { websiteUrl: "https://acme.example" },
      }),
    );
    const { status, body } = await readJson(response);

    expect(status).toBe(400);
    expect(body.error).toBe("Invalid request body");
    expect(body.details).toContain("companyName");
    expect(mockedCreateCompany).not.toHaveBeenCalled();
  });

  it("creates company + admin member with status approved (camelCase body)", async () => {
    queueDuplicateCheck([]);

    const response = await POST(
      makeRequest("/api/onboarding/company-profile", {
        method: "POST",
        json: {
          companyName: "  Acme Construction  ",
          websiteUrl: " https://acme.example ",
          consentDataFetch: true,
        },
      }),
    );
    const { status, body } = await readJson(response);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.company).toMatchObject({ id: TEST_COMPANY_ID });

    expect(mockedCreateCompany).toHaveBeenCalledWith({
      userId: TEST_USER_ID,
      companyName: "Acme Construction",
      companiesHouseNumber: null,
      websiteUrl: "https://acme.example",
      contactPerson: null,
      contactEmail: null,
      contactPhone: null,
      consentDataFetch: true,
      description: null,
      keyCapabilities: null,
      certifications: null,
      equipment: null,
      address: null,
      postcode: null,
      systemExtracted: {},
      humanVerified: {},
      financialData: {},
      complianceData: {},
      status: "active",
      operationLocations: [],
      pastProjects: null,
    });

    expect(mockedCreateCompanyMember).toHaveBeenCalledWith({
      companyId: TEST_COMPANY_ID,
      userId: TEST_USER_ID,
      role: "admin",
      status: "approved",
    });
  });

  it("accepts snake_case keys and passes an explicit status through", async () => {
    queueDuplicateCheck([]);

    const response = await POST(
      makeRequest("/api/onboarding/company-profile", {
        method: "POST",
        json: {
          company_name: "Snake Co",
          contact_email: "info@snake.example",
          companies_house_number: "12345678",
          status: "pending",
        },
      }),
    );
    const { status } = await readJson(response);

    expect(status).toBe(200);
    expect(mockedCreateCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "Snake Co",
        contactEmail: "info@snake.example",
        companiesHouseNumber: "12345678",
        status: "pending",
      }),
    );
  });

  it("defaults status to active when body omits it", async () => {
    queueDuplicateCheck([]);

    await POST(
      makeRequest("/api/onboarding/company-profile", {
        method: "POST",
        json: { companyName: "Default Status Ltd" },
      }),
    );

    expect(mockedCreateCompany).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", consentDataFetch: false }),
    );
  });

  it("returns 409 when a company with the same name already exists", async () => {
    queueDuplicateCheck([{ id: "existing-company" }]);

    const response = await POST(
      makeRequest("/api/onboarding/company-profile", {
        method: "POST",
        json: { companyName: "Acme Construction" },
      }),
    );
    const { status, body } = await readJson(response);

    expect(status).toBe(409);
    expect(body.error).toBe("A company with this name or number already exists.");
    expect(mockedCreateCompany).not.toHaveBeenCalled();
  });
});
