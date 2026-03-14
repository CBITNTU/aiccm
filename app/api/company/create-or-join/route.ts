import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/api";
import {
  sendEmail,
  getAdminNotificationEmailSubject,
  getAdminNotificationEmailHtml,
  getCompanyJoinRequestEmailSubject,
  getCompanyJoinRequestEmailHtml,
} from "@/lib/email";
import { logApiEvent } from "@/lib/services/eventLogger";
import {
  geocodeLocation,
  buildCompanyGeoQuery,
  isGeocodingEnabled,
} from "@/lib/geocode";
import {
  getProfileByUserId,
  updateProfileByUserId,
  createCompany,
  createCompanyMember,
  createUserRole,
  deleteUserRole,
  createCompanyJoinRequest,
} from "@/lib/db/queries";
import { db } from "@/lib/db";
import { companies, companyJoinRequests, companyMembers, userRoles, profiles } from "@/lib/db/schema/app";
import { eq, and, inArray } from "drizzle-orm";

interface NewCompanyData {
  action: "create";
  companyName: string;
  companiesHouseNumber?: string;
  websiteUrl?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
}

interface JoinCompanyData {
  action: "join";
  companyId: string;
  companyName: string;
  message?: string;
}

type RequestData = NewCompanyData | JoinCompanyData;

export async function POST(request: NextRequest) {
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return apiError("Unauthorized", 401);
    }

    const user = session.user;

    // Get current profile and verify user is approved
    const profile = await getProfileByUserId(user.id);

    if (!profile) {
      return apiError("Profile not found", 404);
    }

    // Verify user is approved
    if (profile.approvalStatus !== "approved") {
      return apiError(
        "Your account must be approved before creating or joining companies",
        403,
      );
    }

    const body: RequestData = await request.json();

    if (!body.action || !["create", "join"].includes(body.action)) {
      return apiError("Invalid action. Must be 'create' or 'join'", 400);
    }

    if (body.action === "create") {
      // Create new company
      const createData = body as NewCompanyData;
      if (!createData.companyName?.trim()) {
        return apiError("Company name is required", 400);
      }

      // Validate website URL is required
      if (!createData.websiteUrl?.trim()) {
        return apiError(
          "Website URL is required. Please provide at least a website for your company.",
          400,
        );
      }

      // Validate website URL format
      try {
        const url = new URL(createData.websiteUrl.trim());
        if (!url.protocol.startsWith("http")) {
          return apiError(
            "Website URL must start with http:// or https://",
            400,
          );
        }
      } catch {
        return apiError(
          "Please provide a valid website URL (e.g., https://example.com)",
          400,
        );
      }

      let company;
      try {
        company = await createCompany({
          companyName: createData.companyName.trim(),
          userId: user.id,
          status: "pending_review",
          contactEmail: createData.contactEmail || user.email || null,
          contactPhone: createData.contactPhone || null,
          contactPerson: `${profile.firstName} ${profile.lastName}`,
          companiesHouseNumber: createData.companiesHouseNumber || null,
          websiteUrl: createData.websiteUrl || null,
          address: createData.address || null,
        });
      } catch (err: unknown) {
        console.error("Company creation error:", err);
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("unique") || msg.includes("duplicate")) {
          return apiError("A company with this name already exists", 409);
        }
        return apiError("Failed to create company", 500);
      }

      // Geocode new company if address present
      if (isGeocodingEnabled() && createData.address?.trim()) {
        const geoQuery = buildCompanyGeoQuery(
          createData.address.trim(),
          null,
        );
        if (geoQuery) {
          const coords = await geocodeLocation(geoQuery);
          if (coords) {
            await adminClient
              .from("companies")
              .update({ latitude: coords.lat, longitude: coords.lng })
              .eq("id", company.id);
          }
        }
      }

      // Add user as company admin (pending)
      await createCompanyMember({
        companyId: company.id,
        userId: user.id,
        role: "admin",
        status: "pending",
      });

      // Handle individual user converting to business
      if (profile.accountType === "individual") {
        await updateProfileByUserId(user.id, { accountType: "business" });
        await createUserRole(user.id, "sme-owner");
        await deleteUserRole(user.id, "individual");
      } else {
        await createUserRole(user.id, "sme-owner");
      }

      // Notify superadmins about new company
      const superadmins = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.role, "superadmin"));

      if (superadmins.length > 0) {
        const superadminUserIds = superadmins.map((s) => s.userId);
        const superadminProfiles = await db
          .select({ email: profiles.email })
          .from(profiles)
          .where(inArray(profiles.userId, superadminUserIds));

        const adminEmails = superadminProfiles
          .map((p) => p.email)
          .filter(Boolean) as string[];

        if (adminEmails.length > 0) {
          const userName = `${profile.firstName} ${profile.lastName}`;
          const adminNotificationData = {
            userName,
            userEmail: user.email || "",
            signupType: "new-company" as const,
            companyName: createData.companyName,
            jobTitle: profile.jobTitle || "",
          };

          await sendEmail({
            to: adminEmails,
            subject: getAdminNotificationEmailSubject(adminNotificationData),
            html: getAdminNotificationEmailHtml(adminNotificationData),
          });
        }
      }

      await logApiEvent(request, {
        actionType: "company_created",
        userId: user.id,
        userEmail: user.email || undefined,
        entityType: "company",
        entityId: company.id,
        details: { company_name: createData.companyName },
      }).catch(() => {});

      return apiResponse({
        success: true,
        companyId: company.id,
        message: `Company "${createData.companyName}" created successfully. Pending admin approval.`,
      });
    } else if (body.action === "join") {
      // Join existing company
      const joinData = body as JoinCompanyData;
      if (!joinData.companyId) {
        return apiError("Company ID is required", 400);
      }

      // Verify company exists
      const companyResult = await db
        .select({ id: companies.id, companyName: companies.companyName, userId: companies.userId })
        .from(companies)
        .where(eq(companies.id, joinData.companyId))
        .limit(1);

      const company = companyResult[0];
      if (!company) {
        return apiError("Company not found", 404);
      }

      // Check if user already has a pending/approved join request
      const existingRequestResult = await db
        .select({ id: companyJoinRequests.id, status: companyJoinRequests.status })
        .from(companyJoinRequests)
        .where(
          and(
            eq(companyJoinRequests.userId, user.id),
            eq(companyJoinRequests.companyId, joinData.companyId),
          ),
        )
        .limit(1);

      if (existingRequestResult[0]) {
        return apiError(
          `You already have a ${existingRequestResult[0].status} request to join this company`,
          409,
        );
      }

      // Check if user is already a member
      const existingMembershipResult = await db
        .select({ id: companyMembers.id, status: companyMembers.status })
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.userId, user.id),
            eq(companyMembers.companyId, joinData.companyId),
          ),
        )
        .limit(1);

      if (existingMembershipResult[0]) {
        return apiError(
          `You are already a member of this company (status: ${existingMembershipResult[0].status})`,
          409,
        );
      }

      // Create join request
      try {
        await createCompanyJoinRequest({
          userId: user.id,
          companyId: joinData.companyId,
          companyNameRequested: company.companyName,
          message: joinData.message || null,
          status: "pending",
        });
      } catch (err) {
        console.error("Join request error:", err);
        return apiError("Failed to create join request", 500);
      }

      // Handle individual user converting to business
      if (profile.accountType === "individual") {
        await updateProfileByUserId(user.id, { accountType: "business" });
        await createUserRole(user.id, "sme-member");
        await deleteUserRole(user.id, "individual");
      } else {
        await createUserRole(user.id, "sme-member");
      }

      // Notify company admins
      const companyAdmins = await db
        .select({ userId: companyMembers.userId })
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.companyId, joinData.companyId),
            eq(companyMembers.role, "admin"),
            eq(companyMembers.status, "approved"),
          ),
        );

      if (companyAdmins.length > 0) {
        const adminUserIds = companyAdmins.map((a) => a.userId);
        const adminProfiles = await db
          .select({
            email: profiles.email,
            firstName: profiles.firstName,
            lastName: profiles.lastName,
          })
          .from(profiles)
          .where(inArray(profiles.userId, adminUserIds));

        const userName = `${profile.firstName} ${profile.lastName}`;

        for (const admin of adminProfiles) {
          if (admin.email) {
            const emailData = {
              companyAdminName:
                `${admin.firstName || ""} ${admin.lastName || ""}`.trim() ||
                "Admin",
              companyId: company.id,
              companyName: company.companyName,
              requesterName: userName,
              requesterEmail: user.email || "",
              requesterJobTitle: profile.jobTitle || "",
              message: joinData.message,
            };

            await sendEmail({
              to: admin.email,
              subject: getCompanyJoinRequestEmailSubject(emailData),
              html: getCompanyJoinRequestEmailHtml(emailData),
            });
          }
        }
      }

      await logApiEvent(request, {
        actionType: "company_updated",
        userId: user.id,
        userEmail: user.email || undefined,
        entityType: "company",
        entityId: joinData.companyId,
        details: { company_name: company.companyName, action: "join_request" },
      }).catch(() => {});

      return apiResponse({
        success: true,
        message: `Request to join "${company.companyName}" submitted. Awaiting company admin approval.`,
      });
    }

    return apiError("Invalid action", 400);
  } catch (error) {
    console.error("Company create-or-join error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
