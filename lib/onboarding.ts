/**
 * Onboarding step constants and utilities
 */

export const ONBOARDING_STEPS = {
  EMAIL_VERIFICATION: 1,
  PROFILE_INFO: 2,
  ACCOUNT_TYPE: 3,
  COMPANY_INFO: 4,
  COMPLETE: 5,
} as const;

export type OnboardingStep =
  (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS];

export const ONBOARDING_STEP_NAMES: Record<OnboardingStep, string> = {
  [ONBOARDING_STEPS.EMAIL_VERIFICATION]: "Email Verification",
  [ONBOARDING_STEPS.PROFILE_INFO]: "Profile Information",
  [ONBOARDING_STEPS.ACCOUNT_TYPE]: "Account Type",
  [ONBOARDING_STEPS.COMPANY_INFO]: "Company Information",
  [ONBOARDING_STEPS.COMPLETE]: "Complete",
};

/**
 * Get the next step after the current one
 */
export function getNextStep(
  currentStep: OnboardingStep,
): OnboardingStep | null {
  if (currentStep >= ONBOARDING_STEPS.COMPLETE) {
    return null;
  }
  return (currentStep + 1) as OnboardingStep;
}

/**
 * Check if a step is valid
 */
export function isValidStep(step: number): step is OnboardingStep {
  return Object.values(ONBOARDING_STEPS).includes(step as OnboardingStep);
}

/**
 * Check if onboarding is complete
 */
export function isOnboardingComplete(step: OnboardingStep): boolean {
  return step >= ONBOARDING_STEPS.COMPLETE;
}
