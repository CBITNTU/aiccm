import { describe, it, expect } from "vitest";
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_NAMES,
  getNextStep,
  isValidStep,
  isOnboardingComplete,
  type OnboardingStep,
} from "@/lib/onboarding";

describe("ONBOARDING_STEPS", () => {
  it("defines five sequential steps starting at 1", () => {
    expect(ONBOARDING_STEPS).toEqual({
      EMAIL_VERIFICATION: 1,
      PROFILE_INFO: 2,
      ACCOUNT_TYPE: 3,
      COMPANY_INFO: 4,
      COMPLETE: 5,
    });
  });

  it("has a display name for every step", () => {
    for (const step of Object.values(ONBOARDING_STEPS)) {
      expect(ONBOARDING_STEP_NAMES[step]).toEqual(expect.any(String));
      expect(ONBOARDING_STEP_NAMES[step].length).toBeGreaterThan(0);
    }
    expect(ONBOARDING_STEP_NAMES[ONBOARDING_STEPS.EMAIL_VERIFICATION]).toBe(
      "Email Verification",
    );
    expect(ONBOARDING_STEP_NAMES[ONBOARDING_STEPS.COMPLETE]).toBe("Complete");
  });
});

describe("getNextStep", () => {
  it("advances each intermediate step by one", () => {
    expect(getNextStep(ONBOARDING_STEPS.EMAIL_VERIFICATION)).toBe(
      ONBOARDING_STEPS.PROFILE_INFO,
    );
    expect(getNextStep(ONBOARDING_STEPS.PROFILE_INFO)).toBe(
      ONBOARDING_STEPS.ACCOUNT_TYPE,
    );
    expect(getNextStep(ONBOARDING_STEPS.ACCOUNT_TYPE)).toBe(
      ONBOARDING_STEPS.COMPANY_INFO,
    );
    expect(getNextStep(ONBOARDING_STEPS.COMPANY_INFO)).toBe(
      ONBOARDING_STEPS.COMPLETE,
    );
  });

  it("returns null at the final step", () => {
    expect(getNextStep(ONBOARDING_STEPS.COMPLETE)).toBeNull();
  });

  it("returns null for values beyond the final step", () => {
    expect(getNextStep(6 as OnboardingStep)).toBeNull();
  });
});

describe("isValidStep", () => {
  it("accepts each defined step", () => {
    for (const step of Object.values(ONBOARDING_STEPS)) {
      expect(isValidStep(step)).toBe(true);
    }
  });

  it("rejects out-of-range and non-integer values", () => {
    expect(isValidStep(0)).toBe(false);
    expect(isValidStep(6)).toBe(false);
    expect(isValidStep(-1)).toBe(false);
    expect(isValidStep(2.5)).toBe(false);
    expect(isValidStep(NaN)).toBe(false);
  });
});

describe("isOnboardingComplete", () => {
  it("is false for every step before COMPLETE", () => {
    expect(isOnboardingComplete(ONBOARDING_STEPS.EMAIL_VERIFICATION)).toBe(false);
    expect(isOnboardingComplete(ONBOARDING_STEPS.PROFILE_INFO)).toBe(false);
    expect(isOnboardingComplete(ONBOARDING_STEPS.ACCOUNT_TYPE)).toBe(false);
    expect(isOnboardingComplete(ONBOARDING_STEPS.COMPANY_INFO)).toBe(false);
  });

  it("is true at COMPLETE and beyond", () => {
    expect(isOnboardingComplete(ONBOARDING_STEPS.COMPLETE)).toBe(true);
    expect(isOnboardingComplete(6 as OnboardingStep)).toBe(true);
  });
});
