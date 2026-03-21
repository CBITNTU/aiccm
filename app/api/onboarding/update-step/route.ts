import { NextRequest } from "next/server";
import {
  apiResponse,
  apiError,
} from "@/lib/api";
import { requireAuth } from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import {
  sendEmail,
  getAdminNotificationEmailSubject,
  getAdminNotificationEmailHtml,
  getCompanyJoinRequestEmailSubject,
  getCompanyJoinRequestEmailHtml,
} from "@/lib/email";
import { ONBOARDING_STEPS, isValidStep } from "@/lib/onboarding";
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
import {
  companies,
  companyMembers,
  companyJoinRequests,
  userRoles,
  profiles,
  teamInvitations,
} from "@/lib/db/schema/app";
import { eq, and, inArray, desc } from "drizzle-orm";

interface ProfileData {
  firstName: string;
  lastName: string;
  jobTitle: string;
}

interface AccountTypeData {
  accountType: "individual" | "business";
}

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

interface InvitedConfirmData {
  action: "invited-confirm";
}

type CompanyData = NewCompanyData | JoinCompanyData | InvitedConfirmData;

interface UpdateStepRequest {
  step: number;
  data?: ProfileData | AccountTypeData | CompanyData;
}

/**
 * POST /api/onboarding/update-step
 *
 * Updates the user's onboarding progress and saves step-specific data.
 *
 * Request body:
 * - step: number (2-5)
 * - data: object (step-specific data)
 *
 * Step 2 (Profile Info): { firstName, lastName, jobTitle }
 * Step 3 (Account Type): { accountType: "individual" | "business" }
 * Step 4 (Company Info): { action: "create" | "join", ...data }
 * Step 5 (Complete): {} - marks onboarding as complete
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    const body: UpdateStepRequest = await request.json();
    const { step, data } = body;

    // Validate step (must be between PROFILE_INFO and COMPLETE, not EMAIL_VERIFICATION which is automatic)
    if (!step || !isValidStep(step) || step < ONBOARDING_STEPS.PROFILE_INFO) {
      return apiError("Invalid step number", 400);
    }

    // Get current profile from Drizzle (local Postgres)
    const profile = await getProfileByUserId(user.id);

    if (!profile) {
      return apiError("Profile not found", 404);
    }

    // Validate step progression (can only go forward from current step or revisit)
    // Allow revisiting previous steps for editing
    const currentStep =
      (profile.onboardingStep as number) ||
      ONBOARDING_STEPS.EMAIL_VERIFICATION;
    if (step > currentStep + 1) {
      return apiError("Cannot skip steps", 400);
    }

    // Handle step-specific logic
    switch (step) {
      case ONBOARDING_STEPS.PROFILE_INFO: {
        // Profile Information
        const profileData = data as ProfileData;
        if (
          !profileData?.firstName ||
          !profileData?.lastName ||
          !profileData?.jobTitle
        ) {
          return apiError(
            "First name, last name, and job title are required",
            400,
          );
        }

        // Determine next step based on signup type
        // Invited users skip account type and go to company confirmation
        const isInvitedUser = profile.signupType === "invited";
        const nextStep = isInvitedUser
          ? ONBOARDING_STEPS.COMPANY_INFO
          : ONBOARDING_STEPS.ACCOUNT_TYPE;

        const updated = await updateProfileByUserId(user.id, {
          firstName: profileData.firstName,
          lastName: profileData.lastName,
          jobTitle: profileData.jobTitle,
          onboardingStep: nextStep,
        });

        if (!updated) {
          console.error("Profile update error: no rows updated");
          return apiError("Failed to update profile", 500);
        }

        return apiResponse({
          success: true,
          nextStep,
          message: isInvitedUser
            ? "Profile saved. Confirm your company membership."
            : "Profile information saved",
        });
      }

      case ONBOARDING_STEPS.ACCOUNT_TYPE: {
        // Account Type Selection
        const accountData = data as AccountTypeData;
        if (
          !accountData?.accountType ||
          !["individual", "business"].includes(accountData.accountType)
        ) {
          return apiError("Valid account type is required", 400);
        }

        const nextStep =
          accountData.accountType === "business"
            ? ONBOARDING_STEPS.COMPANY_INFO
            : ONBOARDING_STEPS.COMPLETE;
        const updates: Partial<{ accountType: string; onboardingStep: number; signupType: string }> = {
          accountType: accountData.accountType,
          onboardingStep: nextStep,
        };

        // If individual, set signup_type and mark ready for completion
        if (accountData.accountType === "individual") {
          updates.signupType = "individual";
        }

        const updated = await updateProfileByUserId(user.id, updates);

        if (!updated) {
          console.error("Account type update error: no rows updated");
          return apiError("Failed to update account type", 500);
        }

        return apiResponse({
          success: true,
          nextStep,
          message:
            accountData.accountType === "individual"
              ? "Account type saved. Proceeding to completion."
              : "Account type saved. Please provide company information.",
        });
      }

      case ONBOARDING_STEPS.COMPANY_INFO: {
        // Company Information (for business accounts or invited user confirmation)
        const companyData = data as CompanyData;
        if (!companyData?.action) {
          return apiError("Company action is required", 400);
        }

        // Handle invited user confirmation
        if (companyData.action === "invited-confirm") {
          // Invited user is confirming their company membership
          // Just move to the complete step - the company membership was already created
          const updated = await updateProfileByUserId(user.id, {
            onboardingStep: ONBOARDING_STEPS.COMPLETE,
          });

          if (!updated) {
            console.error("Profile update error: no rows updated");
            return apiError("Failed to update profile", 500);
          }

          return apiResponse({
            success: true,
            nextStep: ONBOARDING_STEPS.COMPLETE,
            message: "Company membership confirmed",
          });
        }

        if (companyData.action === "create") {
          // Create new company
          const createData = companyData as NewCompanyData;
          if (!createData.companyName?.trim()) {
            return apiError("Company name is required", 400);
          }

          // Require at least website URL
          if (!createData.websiteUrl || !createData.websiteUrl.trim()) {
            return apiError(
              "Website URL is required. Please provide at least a website for your company.",
              400,
            );
          }

          // Basic URL validation
          const urlPattern =
            /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
          const websiteUrl = createData.websiteUrl.trim();
          if (
            !urlPattern.test(websiteUrl) &&
            !websiteUrl.startsWith("http://") &&
            !websiteUrl.startsWith("https://")
          ) {
            return apiError(
              "Please enter a valid website URL (e.g., example.com or https://example.com)",
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
                await db
                  .update(companies)
                  .set({ latitude: coords.lat, longitude: coords.lng })
                  .where(eq(companies.id, company.id));
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

          // Update user role to sme-owner
          await createUserRole(user.id, "sme-owner");

          // Remove individual role
          await deleteUserRole(user.id, "individual");

          // Update profile
          const profileUpdated = await updateProfileByUserId(user.id, {
            signupType: "new-company",
            onboardingStep: ONBOARDING_STEPS.COMPLETE,
          });

          if (!profileUpdated) {
            console.error("Profile update error: no rows updated");
          }

          // Queue AI processing jobs for new company (capability taxonomy generation)
          try {
            const { enqueueJob } = await import("@/lib/services/queueService");
            await enqueueJob({
              jobType: "company_taxonomy",
              entityType: "company",
              entityId: company.id,
              priority: 5,
            });
            console.log(
              `Queued company_taxonomy job for new company: ${company.id}`,
            );
          } catch (queueError) {
            console.error("Failed to queue company taxonomy job:", queueError);
          }

          // Log company creation during onboarding
          await logApiEvent(request, {
            actionType: "company_created",
            userId: user.id,
            userEmail: user.email || undefined,
            entityType: "company",
            entityId: company.id,
            details: {
              companyName: createData.companyName,
              onboardingStep: step,
            },
          }).catch(() => {});

          return apiResponse({
            success: true,
            nextStep: ONBOARDING_STEPS.COMPLETE,
            companyId: company.id,
            message: `Company "${createData.companyName}" created successfully`,
          });
        } else if (companyData.action === "join") {
          // Join existing company
          const joinData = companyData as JoinCompanyData;
          if (!joinData.companyId) {
            return apiError("Company ID is required", 400);
          }

          // Verify company exists
          const companyRows = await db
            .select({ id: companies.id, companyName: companies.companyName, userId: companies.userId })
            .from(companies)
            .where(eq(companies.id, joinData.companyId))
            .limit(1);

          const company = companyRows[0];
          if (!company) {
            return apiError("Company not found", 404);
          }

          // Check if user already has a pending/approved join request
          const existingRequestRows = await db
            .select({ id: companyJoinRequests.id, status: companyJoinRequests.status })
            .from(companyJoinRequests)
            .where(
              and(
                eq(companyJoinRequests.userId, user.id),
                eq(companyJoinRequests.companyId, joinData.companyId),
              ),
            )
            .limit(1);

          const existingRequest = existingRequestRows[0];
          if (existingRequest) {
            return apiError(
              `You already have a ${existingRequest.status} request to join this company`,
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

          // Update user role to sme-member
          await createUserRole(user.id, "sme-member");

          // Remove individual role
          await deleteUserRole(user.id, "individual");

          // Update profile
          await updateProfileByUserId(user.id, {
            signupType: "join-company",
            onboardingStep: ONBOARDING_STEPS.COMPLETE,
          });

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
              .select({ email: profiles.email, firstName: profiles.firstName, lastName: profiles.lastName })
              .from(profiles)
              .where(inArray(profiles.userId, adminUserIds));

            const userName = `${profile.firstName} ${profile.lastName}`;

            for (const admin of adminProfiles) {
              if (admin.email) {
                const emailData = {
                  companyAdminName:
                    `${admin.firstName || ""} ${admin.lastName || ""}`.trim() ||
                    "Admin",
                  companyId: joinData.companyId,
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

          return apiResponse({
            success: true,
            nextStep: ONBOARDING_STEPS.COMPLETE,
            message: `Request to join "${company.companyName}" submitted`,
          });
        }

        return apiError("Invalid company action", 400);
      }

      case ONBOARDING_STEPS.COMPLETE: {
        // Mark onboarding as complete
        const completed = await updateProfileByUserId(user.id, {
          onboardingStep: ONBOARDING_STEPS.COMPLETE,
          onboardingCompletedAt: new Date(),
        });

        if (!completed) {
          console.error("Onboarding completion error: no rows updated");
          return apiError("Failed to complete onboarding", 500);
        }

        // Notify superadmins about new user
        const userName = `${profile.firstName} ${profile.lastName}`;
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
            // Get company name if applicable
            let companyName: string | undefined;
            if (profile.signupType === "new-company") {
              const companyRows = await db
                .select({ companyName: companies.companyName })
                .from(companies)
                .where(eq(companies.userId, user.id))
                .limit(1);
              companyName = companyRows[0]?.companyName;
            } else if (profile.signupType === "join-company") {
              const joinRequestRows = await db
                .select({ companyNameRequested: companyJoinRequests.companyNameRequested })
                .from(companyJoinRequests)
                .where(eq(companyJoinRequests.userId, user.id))
                .orderBy(desc(companyJoinRequests.createdAt))
                .limit(1);
              companyName = joinRequestRows[0]?.companyNameRequested;
            }

            const adminNotificationData = {
              userName,
              userEmail: user.email || "",
              signupType: (profile.signupType || "individual") as "individual" | "new-company" | "join-company" | "invited",
              companyName,
              jobTitle: profile.jobTitle || "",
            };

            await sendEmail({
              to: adminEmails,
              subject: getAdminNotificationEmailSubject(adminNotificationData),
              html: getAdminNotificationEmailHtml(adminNotificationData),
            });
          }
        }

        // Log onboarding completion
        await logApiEvent(request, {
          actionType: "user_signup",
          userId: user.id,
          userEmail: user.email || undefined,
          details: {
            onboardingCompleted: true,
            signupType: profile.signupType,
            accountType: profile.accountType,
          },
        }).catch(() => {});

        return apiResponse({
          success: true,
          completed: true,
          message: "Onboarding completed. Your account is pending approval.",
        });
      }

      default:
        return apiError("Invalid step", 400);
    }
  } catch (error) {
    console.error("Update step error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}

/**
 * GET /api/onboarding/update-step
 *
 * Returns the current onboarding state for the user.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Get profile from Drizzle (local Postgres)
    const profile = await getProfileByUserId(user.id);

    if (!profile) {
      return apiError("Profile not found", 404);
    }

    // Fetch invited company info if user is invited
    let invitedCompanyInfo: {
      companyName: string;
      inviterName: string;
    } | null = null;
    if (profile.signupType === "invited" && profile.invitedToCompanyId) {
      // Get company name
      const companyRows = await db
        .select({ companyName: companies.companyName })
        .from(companies)
        .where(eq(companies.id, profile.invitedToCompanyId))
        .limit(1);

      // Get inviter name from team_invitations
      let inviterName = "Your team";
      if (user.email) {
        const invitationRows = await db
          .select({ invitedBy: teamInvitations.invitedBy })
          .from(teamInvitations)
          .where(
            and(
              eq(teamInvitations.companyId, profile.invitedToCompanyId),
              eq(teamInvitations.email, user.email),
            ),
          )
          .orderBy(desc(teamInvitations.createdAt))
          .limit(1);

        const invitation = invitationRows[0];
        if (invitation?.invitedBy) {
          const inviterProfileRows = await db
            .select({ firstName: profiles.firstName, lastName: profiles.lastName })
            .from(profiles)
            .where(eq(profiles.userId, invitation.invitedBy))
            .limit(1);

          const inviterProfile = inviterProfileRows[0];
          if (inviterProfile) {
            inviterName =
              `${inviterProfile.firstName || ""} ${inviterProfile.lastName || ""}`.trim() ||
              "Your team";
          }
        }
      }

      const company = companyRows[0];
      if (company) {
        invitedCompanyInfo = {
          companyName: company.companyName,
          inviterName,
        };
      }
    }

    return apiResponse({
      currentStep:
        (profile.onboardingStep as number) ||
        ONBOARDING_STEPS.EMAIL_VERIFICATION,
      completed: !!profile.onboardingCompletedAt,
      accountType: profile.accountType as string | null,
      signupType: profile.signupType as string | null,
      profile: {
        firstName: profile.firstName as string | null,
        lastName: profile.lastName as string | null,
        jobTitle: profile.jobTitle as string | null,
      },
      emailVerified: !!user.emailVerified,
      email: user.email,
      invitedCompanyInfo,
    });
  } catch (error) {
    console.error("Get onboarding state error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
