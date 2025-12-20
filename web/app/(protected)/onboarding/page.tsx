"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { CompanyOnboardingStep1 } from "@/components/onboarding/CompanyOnboardingStep1";
import { CompanyOnboardingStep2 } from "@/components/onboarding/CompanyOnboardingStep2";

interface Step1Data {
  companyName: string;
  companiesHouseNumber: string;
  websiteUrl: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  consentDataFetch: boolean;
  postcode?: string;
}

interface PrefillData {
  normalized?: {
    description?: { value: string; confidence: number; evidence: string };
    capabilities?: Array<{ value: string; confidence: number; evidence: string }>;
    certifications?: Array<{
      name: string;
      issuer: string;
      certId: string;
      validUntil: string;
      confidence: number;
      evidence: string;
    }>;
    equipment?: Array<{
      name: string;
      model: string;
      capacity: string;
      notes: string;
      confidence: number;
      evidence: string;
    }>;
    sectors?: Array<{ value: string; confidence: number; evidence: string }>;
    locations?: Array<{ value: string; confidence: number; evidence: string }>;
    address?: { value: string; confidence: number; evidence: string };
    financial?: Record<string, { value: number; confidence: number }>;
    compliance?: Record<string, { value: string; confidence: number }>;
  };
}

export default function OnboardingPage() {
  const { user } = useAuth();
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null
  );
  const [currentStep, setCurrentStep] = useState(1);
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [prefillData, setPrefillData] = useState<PrefillData | null>(null);

  // Initialize supabase client
  useEffect(() => {
    try {
      const client = createClient();
      setSupabase(client);
    } catch (error) {
      console.error("Failed to create Supabase client:", error);
    }
  }, []);

  const handleStep1Next = (data: Step1Data, prefill: PrefillData | null) => {
    setStep1Data(data);
    setPrefillData(prefill);
    setCurrentStep(2);
  };

  const handleStep2Back = () => {
    setCurrentStep(1);
  };

  if (!supabase) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentStep >= 1
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              1
            </div>
            <span
              className={
                currentStep >= 1 ? "font-medium" : "text-muted-foreground"
              }
            >
              Company Basics
            </span>
          </div>
          <div className="w-16 h-0.5 bg-muted" />
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentStep >= 2
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              2
            </div>
            <span
              className={
                currentStep >= 2 ? "font-medium" : "text-muted-foreground"
              }
            >
              Review & Confirm
            </span>
          </div>
        </div>
      </div>

      {currentStep === 1 && (
        <CompanyOnboardingStep1 supabase={supabase} onNext={handleStep1Next} />
      )}
      {currentStep === 2 && step1Data && user && (
        <CompanyOnboardingStep2
          supabase={supabase}
          user={user}
          step1Data={step1Data}
          prefillData={prefillData}
          onBack={handleStep2Back}
        />
      )}
    </div>
  );
}
