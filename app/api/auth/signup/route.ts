import { NextRequest } from "next/server";
import { createAdminClient, apiResponse, apiError } from "@/lib/api";
import {
  sendEmail,
  getWelcomeVerificationEmailSubject,
  getWelcomeVerificationEmailHtml,
  getAdminNotificationEmailSubject,
  getAdminNotificationEmailHtml,
  getCompanyJoinRequestEmailSubject,
  getCompanyJoinRequestEmailHtml,
  getPlatformUrl,
} from "@/lib/email";

export interface SignupRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  signupType: "individual" | "new-company" | "join-company";
  companyName?: string;
  existingCompanyId?: string;
  message?: string; // Optional message when joining a company
  // New company fields (for new-company signup type)
  companiesHouseNumber?: string;
  websiteUrl?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface SignupResponse {
  success: boolean;
  userId?: string;
  message: string;
  requiresApproval: boolean;
  signupType: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SignupRequest = await request.json();
    const {
      email,
      password,
      firstName,
      lastName,
      jobTitle,
      signupType,
      companyName,
      existingCompanyId,
      message,
      companiesHouseNumber,
      websiteUrl,
      contactPerson,
      contactEmail,
      contactPhone,
    } = body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !signupType) {
      return apiError("Missing required fields", 400);
    }

    // Validate signup type specific fields
    if (signupType === "new-company" && !companyName) {
      return apiError("Company name is required for new company signup", 400);
    }

    if (signupType === "join-company" && !existingCompanyId) {
      return apiError("Company selection is required to join a company", 400);
    }

    const supabase = createAdminClient();

    // Check for duplicate company number (before creating user to avoid rollback)
    if (signupType === "new-company" && companiesHouseNumber) {
      const normalizedNumber = companiesHouseNumber.replace(/\s/g, "").toUpperCase();

      const { data: existingCompany } = await supabase
        .from("companies")
        .select("id, company_name")
        .eq("companies_house_number", normalizedNumber)
        .single();

      if (existingCompany) {
        return apiError(
          `A company with this Companies House number is already registered: "${existingCompany.company_name}"`,
          409
        );
      }
    }

    // 1. Create auth user with Supabase Admin API using generateLink
    // This creates the user with unverified email and returns a verification link
    const { data: linkData, error: authError } =
      await supabase.auth.admin.generateLink({
        type: "signup",
        email,
        password,
        options: {
          redirectTo: getPlatformUrl("/auth/callback"),
          data: {
            first_name: firstName,
            last_name: lastName,
            job_title: jobTitle,
          },
        },
      });

    if (authError) {
      console.error("Auth user creation error:", authError);
      if (authError.message.includes("already been registered")) {
        return apiError(
          "An account with this email already exists. Please sign in instead.",
          400
        );
      }
      return apiError(authError.message, 400);
    }

    if (!linkData?.user) {
      return apiError("Failed to create user", 500);
    }

    const userId = linkData.user.id;
    const verificationLink = linkData.properties.action_link;
    const userName = `${firstName} ${lastName}`;

    // 2. Handle signup type specific logic
    let responseMessage = "";

    if (signupType === "individual") {
      // Individual signup - just needs superadmin approval
      // Role is already 'individual' from the trigger
      responseMessage =
        "Your individual account has been created and is pending approval.";
    } else if (signupType === "new-company") {
      // Create new company with all provided details
      // Normalize company number for storage (uppercase, no spaces)
      const normalizedCompanyNumber = companiesHouseNumber
        ? companiesHouseNumber.replace(/\s/g, "").toUpperCase()
        : null;

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert({
          company_name: companyName!,
          user_id: userId,
          status: "pending_review",
          companies_house_number: normalizedCompanyNumber,
          website_url: websiteUrl || null,
          contact_person: contactPerson || `${firstName} ${lastName}`,
          contact_email: contactEmail || email,
          contact_phone: contactPhone || null,
        })
        .select()
        .single();

      if (companyError) {
        console.error("Company creation error:", companyError);
        // Rollback: delete the created user
        await supabase.auth.admin.deleteUser(userId);
        return apiError("Failed to create company", 500);
      }

      // Add user as company admin in company_members (pending)
      await supabase.from("company_members").insert({
        company_id: company.id,
        user_id: userId,
        role: "admin",
        status: "pending",
      });

      // Update user role to sme-owner
      await supabase.from("user_roles").upsert(
        {
          user_id: userId,
          role: "sme-owner",
        },
        {
          onConflict: "user_id,role",
        }
      );

      // Remove individual role if exists
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "individual");

      responseMessage = `Your company "${companyName}" has been registered and is pending approval.`;
    } else if (signupType === "join-company") {
      // Get company details
      const { data: company, error: companyFetchError } = await supabase
        .from("companies")
        .select("id, company_name, user_id")
        .eq("id", existingCompanyId!)
        .single();

      if (companyFetchError || !company) {
        await supabase.auth.admin.deleteUser(userId);
        return apiError("Company not found", 400);
      }

      // Create join request
      const { error: joinRequestError } = await supabase
        .from("company_join_requests")
        .insert({
          user_id: userId,
          company_id: existingCompanyId!,
          company_name_requested: company.company_name,
          message: message || null,
          status: "pending",
        });

      if (joinRequestError) {
        console.error("Join request error:", joinRequestError);
        await supabase.auth.admin.deleteUser(userId);
        return apiError("Failed to create join request", 500);
      }

      // Update user role to sme-member (pending approval)
      await supabase.from("user_roles").upsert(
        {
          user_id: userId,
          role: "sme-member",
        },
        {
          onConflict: "user_id,role",
        }
      );

      // Remove individual role if exists
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "individual");

      // Send email to company admin (if exists)
      const { data: companyAdmins } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", existingCompanyId!)
        .eq("role", "admin")
        .eq("status", "approved");

      if (companyAdmins && companyAdmins.length > 0) {
        // Get admin profiles for email
        const adminUserIds = companyAdmins.map((a) => a.user_id);
        const { data: adminProfiles } = await supabase
          .from("profiles")
          .select("email, first_name, last_name")
          .in("user_id", adminUserIds);

        // Send email to each company admin
        for (const admin of adminProfiles || []) {
          if (admin.email) {
            const emailData = {
              companyAdminName: `${admin.first_name || ""} ${admin.last_name || ""}`.trim() || "Admin",
              companyName: company.company_name,
              requesterName: userName,
              requesterEmail: email,
              requesterJobTitle: jobTitle,
              message: message,
            };

            await sendEmail({
              to: admin.email,
              subject: getCompanyJoinRequestEmailSubject(emailData),
              html: getCompanyJoinRequestEmailHtml(emailData),
            });
          }
        }
      }

      responseMessage = `Your request to join "${company.company_name}" has been submitted and is pending approval.`;
    }

    // 3. Send combined welcome & verification email to the new user
    const welcomeEmailData = {
      userName,
      signupType,
      companyName,
      verificationLink,
    };

    await sendEmail({
      to: email,
      subject: getWelcomeVerificationEmailSubject(),
      html: getWelcomeVerificationEmailHtml(welcomeEmailData),
    });

    // 4. Notify superadmins about new signup
    const { data: superadmins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "superadmin");

    if (superadmins && superadmins.length > 0) {
      const superadminUserIds = superadmins.map((s) => s.user_id);
      const { data: superadminProfiles } = await supabase
        .from("profiles")
        .select("email")
        .in("user_id", superadminUserIds);

      const adminEmails = (superadminProfiles || [])
        .map((p) => p.email)
        .filter(Boolean) as string[];

      if (adminEmails.length > 0) {
        const adminNotificationData = {
          userName,
          userEmail: email,
          signupType,
          companyName,
          jobTitle,
        };

        await sendEmail({
          to: adminEmails,
          subject: getAdminNotificationEmailSubject(adminNotificationData),
          html: getAdminNotificationEmailHtml(adminNotificationData),
        });
      }
    }

    // 5. Return success response
    const response: SignupResponse = {
      success: true,
      userId,
      message: responseMessage,
      requiresApproval: true,
      signupType,
    };

    return apiResponse(response, 201);
  } catch (error) {
    console.error("Signup error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
