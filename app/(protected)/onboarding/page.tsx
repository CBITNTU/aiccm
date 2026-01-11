"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmailVerificationStep } from "@/components/onboarding/EmailVerificationStep";
import { ProfileInfoStep } from "@/components/onboarding/ProfileInfoStep";
import { AccountTypeStep } from "@/components/onboarding/AccountTypeStep";
import { CompanyInfoStep } from "@/components/onboarding/CompanyInfoStep";
import { PendingApprovalStep } from "@/components/onboarding/PendingApprovalStep";
import { Loader2 } from "lucide-react";

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
}

const STEP_LABELS = [
  { step: 1, label: "Verify Email" },
  { step: 2, label: "Profile" },
  { step: 3, label: "Account Type" },
  { step: 4, label: "Company" },
  { step: 5, label: "Complete" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [state, setState] = useState<OnboardingState>({
    currentStep: 1,
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
      let currentStep = data.currentStep || 1;

      // If email is verified but step is still 1, advance to 2
      if (data.emailVerified && currentStep === 1) {
        currentStep = 2;
      }

      // Get company name if applicable
      let companyName: string | null = null;
      if (data.signupType === "new-company" || data.signupType === "join-company") {
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
        profile: data.profile || { firstName: null, lastName: null, jobTitle: null },
        companyName,
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
      currentStep: 2,
    }));
  };

  const handleProfileComplete = () => {
    setState((prev) => ({
      ...prev,
      currentStep: 3,
    }));
    // Refetch to get updated data
    fetchOnboardingState();
  };

  const handleAccountTypeComplete = (accountType: "individual" | "business") => {
    if (accountType === "individual") {
      // Skip to step 5 (complete)
      setState((prev) => ({
        ...prev,
        accountType,
        signupType: "individual",
        currentStep: 5,
      }));
    } else {
      // Go to company info step
      setState((prev) => ({
        ...prev,
        accountType,
        currentStep: 4,
      }));
    }
  };

  const handleCompanyComplete = () => {
    setState((prev) => ({
      ...prev,
      currentStep: 5,
    }));
    // Refetch to get company name
    fetchOnboardingState();
  };

  // Get steps to display based on account type
  const getVisibleSteps = () => {
    if (state.accountType === "individual") {
      // Individual: skip company step
      return STEP_LABELS.filter((s) => s.step !== 4);
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
  const currentStepIndex = visibleSteps.findIndex((s) => s.step === state.currentStep);

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
        {state.currentStep === 1 && (
          <EmailVerificationStep
            email={state.email}
            onVerified={handleEmailVerified}
          />
        )}

        {state.currentStep === 2 && (
          <ProfileInfoStep
            initialData={{
              firstName: state.profile.firstName || undefined,
              lastName: state.profile.lastName || undefined,
              jobTitle: state.profile.jobTitle || undefined,
            }}
            onComplete={handleProfileComplete}
          />
        )}

        {state.currentStep === 3 && (
          <AccountTypeStep onComplete={handleAccountTypeComplete} />
        )}

        {state.currentStep === 4 && (
          <CompanyInfoStep
            userEmail={state.email}
            onComplete={handleCompanyComplete}
          />
        )}

        {state.currentStep === 5 && (
          <PendingApprovalStep
            signupType={state.signupType}
            companyName={state.companyName}
          />
        )}
      </div>
    </div>
  );
}
