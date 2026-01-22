import { NextRequest } from "next/server";
import {
  createApiClient,
  createAdminClient,
  apiResponse,
  apiError,
} from "@/lib/api";
import {
  sendEmail,
  getAdminNotificationEmailSubject,
  getAdminNotificationEmailHtml,
  getCompanyJoinRequestEmailSubject,
  getCompanyJoinRequestEmailHtml,
} from "@/lib/email";
import { ONBOARDING_STEPS, isValidStep } from "@/lib/onboarding";

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
    const supabase = await createApiClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return apiError("Unauthorized", 401);
    }

    const body: UpdateStepRequest = await request.json();
    const { step, data } = body;

    // Validate step (must be between PROFILE_INFO and COMPLETE, not EMAIL_VERIFICATION which is automatic)
    if (!step || !isValidStep(step) || step < ONBOARDING_STEPS.PROFILE_INFO) {
      return apiError("Invalid step number", 400);
    }

    const adminClient = createAdminClient();

    // Get current profile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error: profileError } = await (adminClient.from("profiles") as any)
      .select("*, onboarding_step, onboarding_completed_at, account_type")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return apiError("Profile not found", 404);
    }

    // Validate step progression (can only go forward from current step or revisit)
    // Allow revisiting previous steps for editing
    const currentStep = (profile.onboarding_step as number) || ONBOARDING_STEPS.EMAIL_VERIFICATION;
    if (step > currentStep + 1) {
      return apiError("Cannot skip steps", 400);
    }

    // Handle step-specific logic
    switch (step) {
      case ONBOARDING_STEPS.PROFILE_INFO: {
        // Profile Information
        const profileData = data as ProfileData;
        if (!profileData?.firstName || !profileData?.lastName || !profileData?.jobTitle) {
          return apiError("First name, last name, and job title are required", 400);
        }

        // Determine next step based on signup type
        // Invited users skip account type and go to company confirmation
        const isInvitedUser = profile.signup_type === "invited";
        const nextStep = isInvitedUser
          ? ONBOARDING_STEPS.COMPANY_INFO
          : ONBOARDING_STEPS.ACCOUNT_TYPE;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (adminClient.from("profiles") as any)
          .update({
            first_name: profileData.firstName,
            last_name: profileData.lastName,
            job_title: profileData.jobTitle,
            onboarding_step: nextStep,
          })
          .eq("user_id", user.id);

        if (updateError) {
          console.error("Profile update error:", updateError);
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
        if (!accountData?.accountType || !["individual", "business"].includes(accountData.accountType)) {
          return apiError("Valid account type is required", 400);
        }

        const nextStep = accountData.accountType === "business"
          ? ONBOARDING_STEPS.COMPANY_INFO
          : ONBOARDING_STEPS.COMPLETE;
        const updates: Record<string, unknown> = {
          account_type: accountData.accountType,
          onboarding_step: nextStep,
        };

        // If individual, set signup_type and mark ready for completion
        if (accountData.accountType === "individual") {
          updates.signup_type = "individual";
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (adminClient.from("profiles") as any)
          .update(updates)
          .eq("user_id", user.id);

        if (updateError) {
          console.error("Account type update error:", updateError);
          return apiError("Failed to update account type", 500);
        }

        return apiResponse({
          success: true,
          nextStep,
          message: accountData.accountType === "individual"
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updateError } = await (adminClient.from("profiles") as any)
            .update({
              onboarding_step: ONBOARDING_STEPS.COMPLETE,
            })
            .eq("user_id", user.id);

          if (updateError) {
            console.error("Profile update error:", updateError);
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

          const { data: company, error: companyError } = await adminClient
            .from("companies")
            .insert({
              company_name: createData.companyName.trim(),
              user_id: user.id,
              status: "pending_review",
              contact_email: createData.contactEmail || user.email,
              contact_phone: createData.contactPhone || null,
              contact_person: `${profile.first_name} ${profile.last_name}`,
              companies_house_number: createData.companiesHouseNumber || null,
              website_url: createData.websiteUrl || null,
              address: createData.address || null,
            })
            .select()
            .single();

          if (companyError) {
            console.error("Company creation error:", companyError);
            if (companyError.code === "23505") {
              return apiError("A company with this name already exists", 409);
            }
            return apiError("Failed to create company", 500);
          }

          // Add user as company admin (pending)
          await adminClient.from("company_members").insert({
            company_id: company.id,
            user_id: user.id,
            role: "admin",
            status: "pending",
          });

          // Update user role to sme-owner
          await adminClient.from("user_roles").upsert(
            { user_id: user.id, role: "sme-owner" },
            { onConflict: "user_id,role" }
          );

          // Remove individual role
          await adminClient
            .from("user_roles")
            .delete()
            .eq("user_id", user.id)
            .eq("role", "individual");

          // Update profile
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: profileUpdateError } = await (adminClient.from("profiles") as any)
            .update({
              signup_type: "new-company",
              onboarding_step: ONBOARDING_STEPS.COMPLETE,
            })
            .eq("user_id", user.id);

          if (profileUpdateError) {
            console.error("Profile update error:", profileUpdateError);
          }

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
          const { data: company, error: companyFetchError } = await adminClient
            .from("companies")
            .select("id, company_name, user_id")
            .eq("id", joinData.companyId)
            .single();

          if (companyFetchError || !company) {
            return apiError("Company not found", 404);
          }

          // Check if user already has a pending/approved join request
          const { data: existingRequest } = await adminClient
            .from("company_join_requests")
            .select("id, status")
            .eq("user_id", user.id)
            .eq("company_id", joinData.companyId)
            .single();

          if (existingRequest) {
            return apiError(
              `You already have a ${existingRequest.status} request to join this company`,
              409
            );
          }

          // Create join request
          const { error: joinRequestError } = await adminClient
            .from("company_join_requests")
            .insert({
              user_id: user.id,
              company_id: joinData.companyId,
              company_name_requested: company.company_name,
              message: joinData.message || null,
              status: "pending",
            });

          if (joinRequestError) {
            console.error("Join request error:", joinRequestError);
            return apiError("Failed to create join request", 500);
          }

          // Update user role to sme-member
          await adminClient.from("user_roles").upsert(
            { user_id: user.id, role: "sme-member" },
            { onConflict: "user_id,role" }
          );

          // Remove individual role
          await adminClient
            .from("user_roles")
            .delete()
            .eq("user_id", user.id)
            .eq("role", "individual");

          // Update profile
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (adminClient.from("profiles") as any)
            .update({
              signup_type: "join-company",
              onboarding_step: ONBOARDING_STEPS.COMPLETE,
            })
            .eq("user_id", user.id);

          // Notify company admins
          const { data: companyAdmins } = await adminClient
            .from("company_members")
            .select("user_id")
            .eq("company_id", joinData.companyId)
            .eq("role", "admin")
            .eq("status", "approved");

          if (companyAdmins && companyAdmins.length > 0) {
            const adminUserIds = companyAdmins.map((a) => a.user_id);
            const { data: adminProfiles } = await adminClient
              .from("profiles")
              .select("email, first_name, last_name")
              .in("user_id", adminUserIds);

            const userName = `${profile.first_name} ${profile.last_name}`;

            for (const admin of adminProfiles || []) {
              if (admin.email) {
                const emailData = {
                  companyAdminName: `${admin.first_name || ""} ${admin.last_name || ""}`.trim() || "Admin",
                  companyId: joinData.companyId,
                  companyName: company.company_name,
                  requesterName: userName,
                  requesterEmail: user.email || "",
                  requesterJobTitle: profile.job_title || "",
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
            message: `Request to join "${company.company_name}" submitted`,
          });
        }

        return apiError("Invalid company action", 400);
      }

      case ONBOARDING_STEPS.COMPLETE: {
        // Mark onboarding as complete
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: completeError } = await (adminClient.from("profiles") as any)
          .update({
            onboarding_step: ONBOARDING_STEPS.COMPLETE,
            onboarding_completed_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);

        if (completeError) {
          console.error("Onboarding completion error:", completeError);
          return apiError("Failed to complete onboarding", 500);
        }

        // Notify superadmins about new user
        const userName = `${profile.first_name} ${profile.last_name}`;
        const { data: superadmins } = await adminClient
          .from("user_roles")
          .select("user_id")
          .eq("role", "superadmin");

        if (superadmins && superadmins.length > 0) {
          const superadminUserIds = superadmins.map((s) => s.user_id);
          const { data: superadminProfiles } = await adminClient
            .from("profiles")
            .select("email")
            .in("user_id", superadminUserIds);

          const adminEmails = (superadminProfiles || [])
            .map((p) => p.email)
            .filter(Boolean) as string[];

          if (adminEmails.length > 0) {
            // Get company name if applicable
            let companyName: string | undefined;
            if (profile.signup_type === "new-company") {
              const { data: company } = await adminClient
                .from("companies")
                .select("company_name")
                .eq("user_id", user.id)
                .single();
              companyName = company?.company_name;
            } else if (profile.signup_type === "join-company") {
              const { data: joinRequest } = await adminClient
                .from("company_join_requests")
                .select("company_name_requested")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(1)
                .single();
              companyName = joinRequest?.company_name_requested;
            }

            const adminNotificationData = {
              userName,
              userEmail: user.email || "",
              signupType: profile.signup_type || "individual",
              companyName,
              jobTitle: profile.job_title || "",
            };

            await sendEmail({
              to: adminEmails,
              subject: getAdminNotificationEmailSubject(adminNotificationData),
              html: getAdminNotificationEmailHtml(adminNotificationData),
            });
          }
        }

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
export async function GET() {
  try {
    const supabase = await createApiClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return apiError("Unauthorized", 401);
    }

    const adminClient = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error: profileError } = await (adminClient.from("profiles") as any)
      .select("onboarding_step, onboarding_completed_at, account_type, signup_type, first_name, last_name, job_title, invited_to_company_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return apiError("Profile not found", 404);
    }

    // Fetch invited company info if user is invited
    let invitedCompanyInfo: { companyName: string; inviterName: string } | null = null;
    if (profile.signup_type === "invited" && profile.invited_to_company_id) {
      // Get company name
      const { data: company } = await adminClient
        .from("companies")
        .select("company_name")
        .eq("id", profile.invited_to_company_id)
        .single();

      // Get inviter name from team_invitations
      const { data: invitation } = user.email
        ? await adminClient
            .from("team_invitations")
            .select("invited_by")
            .eq("company_id", profile.invited_to_company_id)
            .eq("email", user.email)
            .order("created_at", { ascending: false })
            .limit(1)
            .single()
        : { data: null };

      let inviterName = "Your team";
      if (invitation?.invited_by) {
        const { data: inviterProfile } = await adminClient
          .from("profiles")
          .select("first_name, last_name")
          .eq("user_id", invitation.invited_by)
          .single();

        if (inviterProfile) {
          inviterName = `${inviterProfile.first_name || ""} ${inviterProfile.last_name || ""}`.trim() || "Your team";
        }
      }

      if (company) {
        invitedCompanyInfo = {
          companyName: company.company_name,
          inviterName,
        };
      }
    }

    return apiResponse({
      currentStep: (profile.onboarding_step as number) || ONBOARDING_STEPS.EMAIL_VERIFICATION,
      completed: !!profile.onboarding_completed_at,
      accountType: profile.account_type as string | null,
      signupType: profile.signup_type as string | null,
      profile: {
        firstName: profile.first_name as string | null,
        lastName: profile.last_name as string | null,
        jobTitle: profile.job_title as string | null,
      },
      emailVerified: !!user.email_confirmed_at,
      email: user.email,
      invitedCompanyInfo,
    });
  } catch (error) {
    console.error("Get onboarding state error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
