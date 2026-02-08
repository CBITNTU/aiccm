"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmailVerificationStep } from "@/components/onboarding/EmailVerificationStep";
import { ProfileInfoStep } from "@/components/onboarding/ProfileInfoStep";
import { AccountTypeStep } from "@/components/onboarding/AccountTypeStep";
import { CompanyInfoStep } from "@/components/onboarding/CompanyInfoStep";
import { PendingApprovalStep } from "@/components/onboarding/PendingApprovalStep";
import { InvitedCompanyInfoStep } from "@/components/onboarding/InvitedCompanyInfoStep";
import { Loader2 } from "lucide-react";
import { ONBOARDING_STEPS } from "@/lib/onboarding";

interface OnboardingState {
  currentStep: number;
  emailVerified: boolean;
  email: string;
  accountType: "individual" | "business" | null;
  signupType: string | null;
  profile: {
    firstName: string | null;
    lastName: string | null;
    jobTitle: string | null;
  };
  companyName: string | null;
  invitedCompanyInfo: {
    companyName: string;
    inviterName: string;
  } | null;
}

const STEP_LABELS = [
  { step: ONBOARDING_STEPS.EMAIL_VERIFICATION, label: "Verify Email" },
  { step: ONBOARDING_STEPS.PROFILE_INFO, label: "Profile" },
  { step: ONBOARDING_STEPS.ACCOUNT_TYPE, label: "Account Type" },
  { step: ONBOARDING_STEPS.COMPANY_INFO, label: "Company" },
  { step: ONBOARDING_STEPS.COMPLETE, label: "Complete" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [state, setState] = useState<OnboardingState>({
    currentStep: ONBOARDING_STEPS.EMAIL_VERIFICATION,
    emailVerified: false,
    email: "",
    accountType: null,
    signupType: null,
    profile: {
      firstName: null,
      lastName: null,
      jobTitle: null,
    },
    companyName: null,
    invitedCompanyInfo: null,
  });

  // Fetch current onboarding state
  const fetchOnboardingState = useCallback(async () => {
    try {
      const response = await fetch("/api/onboarding/update-step");
      const data = await response.json();

      if (!response.ok) {
        console.error("Error fetching onboarding state:", data.error);
        return;
      }

      // If onboarding is already complete, redirect to pending-approval or dashboard
      if (data.completed) {
        router.push("/pending-approval");
        return;
      }

      // Determine current step based on data
      let currentStep = data.currentStep || ONBOARDING_STEPS.EMAIL_VERIFICATION;

      // If email is verified but step is still EMAIL_VERIFICATION, advance to PROFILE_INFO
      if (
        data.emailVerified &&
        currentStep === ONBOARDING_STEPS.EMAIL_VERIFICATION
      ) {
        currentStep = ONBOARDING_STEPS.PROFILE_INFO;
      }

      // Get company name if applicable
      let companyName: string | null = null;

      // For invited users, get company name from invitedCompanyInfo
      if (data.signupType === "invited" && data.invitedCompanyInfo) {
        companyName = data.invitedCompanyInfo.companyName;
      } else if (
        data.signupType === "new-company" ||
        data.signupType === "join-company"
      ) {
        // Fetch company name from backend
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          // Check for owned company
          const { data: company } = await supabase
            .from("companies")
            .select("company_name")
            .eq("user_id", userData.user.id)
            .single();

          if (company) {
            companyName = company.company_name;
          } else {
            // Check for join request
            const { data: joinRequest } = await supabase
              .from("company_join_requests")
              .select("company_name_requested")
              .eq("user_id", userData.user.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            if (joinRequest) {
              companyName = joinRequest.company_name_requested;
            }
          }
        }
      }

      setState({
        currentStep,
        emailVerified: data.emailVerified || false,
        email: data.email || "",
        accountType: data.accountType || null,
        signupType: data.signupType || null,
        profile: data.profile || {
          firstName: null,
          lastName: null,
          jobTitle: null,
        },
        companyName,
        invitedCompanyInfo: data.invitedCompanyInfo || null,
      });
    } catch (error) {
      console.error("Error fetching onboarding state:", error);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchOnboardingState();
  }, [fetchOnboardingState]);

  const handleEmailVerified = () => {
    setState((prev) => ({
      ...prev,
      emailVerified: true,
      currentStep: ONBOARDING_STEPS.PROFILE_INFO,
    }));
  };

  const handleProfileComplete = () => {
    // For invited users, skip account type and go to company confirmation
    if (state.signupType === "invited") {
      setState((prev) => ({
        ...prev,
        currentStep: ONBOARDING_STEPS.COMPANY_INFO,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        currentStep: ONBOARDING_STEPS.ACCOUNT_TYPE,
      }));
    }
    // Refetch to get updated data
    fetchOnboardingState();
  };

  const handleInvitedCompanyConfirm = () => {
    setState((prev) => ({
      ...prev,
      currentStep: ONBOARDING_STEPS.COMPLETE,
    }));
    // Refetch to ensure state is synced
    fetchOnboardingState();
  };

  const handleAccountTypeComplete = (
    accountType: "individual" | "business",
  ) => {
    if (accountType === "individual") {
      // Skip to COMPLETE step
      setState((prev) => ({
        ...prev,
        accountType,
        signupType: "individual",
        currentStep: ONBOARDING_STEPS.COMPLETE,
      }));
    } else {
      // Go to COMPANY_INFO step
      setState((prev) => ({
        ...prev,
        accountType,
        currentStep: ONBOARDING_STEPS.COMPANY_INFO,
      }));
    }
  };

  const handleCompanyComplete = () => {
    setState((prev) => ({
      ...prev,
      currentStep: ONBOARDING_STEPS.COMPLETE,
    }));
    // Refetch to get company name
    fetchOnboardingState();
  };

  // Get steps to display based on account type and signup type
  const getVisibleSteps = () => {
    // Invited users: skip email verification and account type steps
    if (state.signupType === "invited") {
      return [
        { step: ONBOARDING_STEPS.PROFILE_INFO, label: "Profile" },
        { step: ONBOARDING_STEPS.COMPANY_INFO, label: "Company" },
        { step: ONBOARDING_STEPS.COMPLETE, label: "Complete" },
      ];
    }

    if (state.accountType === "individual") {
      // Individual: skip company step
      return STEP_LABELS.filter(
        (s) => s.step !== ONBOARDING_STEPS.COMPANY_INFO,
      );
    }
    return STEP_LABELS;
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading your progress...</p>
        </div>
      </div>
    );
  }

  const visibleSteps = getVisibleSteps();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Progress Indicator */}
      <div className="mb-12">
        <div className="flex items-center justify-center">
          {visibleSteps.map((step, index) => (
            <div key={step.step} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    step.step < state.currentStep
                      ? "bg-green-500 text-white"
                      : step.step === state.currentStep
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step.step < state.currentStep ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`text-xs mt-2 ${
                    step.step === state.currentStep
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < visibleSteps.length - 1 && (
                <div
                  className={`w-16 h-0.5 mx-2 ${
                    step.step < state.currentStep ? "bg-green-500" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="mt-8">
        {state.currentStep === ONBOARDING_STEPS.EMAIL_VERIFICATION && (
          <EmailVerificationStep
            email={state.email}
            onVerified={handleEmailVerified}
          />
        )}

        {state.currentStep === ONBOARDING_STEPS.PROFILE_INFO && (
          <ProfileInfoStep
            initialData={{
              firstName: state.profile.firstName || undefined,
              lastName: state.profile.lastName || undefined,
              jobTitle: state.profile.jobTitle || undefined,
            }}
            companyContext={
              state.signupType === "invited" && state.invitedCompanyInfo
                ? { companyName: state.invitedCompanyInfo.companyName }
                : undefined
            }
            onComplete={handleProfileComplete}
          />
        )}

        {state.currentStep === ONBOARDING_STEPS.ACCOUNT_TYPE &&
          state.signupType !== "invited" && (
            <AccountTypeStep onComplete={handleAccountTypeComplete} />
          )}

        {state.currentStep === ONBOARDING_STEPS.COMPANY_INFO &&
          state.signupType === "invited" &&
          state.invitedCompanyInfo && (
            <InvitedCompanyInfoStep
              companyName={state.invitedCompanyInfo.companyName}
              inviterName={state.invitedCompanyInfo.inviterName}
              onComplete={handleInvitedCompanyConfirm}
            />
          )}

        {state.currentStep === ONBOARDING_STEPS.COMPANY_INFO &&
          state.signupType !== "invited" && (
            <CompanyInfoStep
              userEmail={state.email}
              onComplete={handleCompanyComplete}
            />
          )}

        {state.currentStep === ONBOARDING_STEPS.COMPLETE && (
          <PendingApprovalStep
            signupType={state.signupType}
            companyName={state.companyName}
          />
        )}
      </div>
    </div>
  );
}
