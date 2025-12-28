"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { Building2, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface Step1Data {
  companyName: string;
  companiesHouseNumber: string;
  websiteUrl: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  consentDataFetch: boolean;
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

interface CompanyOnboardingStep1Props {
  supabase: SupabaseClient<Database>;
  onNext: (data: Step1Data, prefillData: PrefillData | null) => void;
}

export function CompanyOnboardingStep1({
  supabase,
  onNext,
}: CompanyOnboardingStep1Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Step1Data>({
    companyName: "",
    companiesHouseNumber: "",
    websiteUrl: "",
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    consentDataFetch: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.companyName.trim()) {
      newErrors.companyName = "Company name is required";
    }

    if (!formData.contactPerson.trim()) {
      newErrors.contactPerson = "Contact person is required";
    }

    if (!formData.contactEmail.trim()) {
      newErrors.contactEmail = "Contact email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
      newErrors.contactEmail = "Invalid email format";
    }

    if (
      formData.companiesHouseNumber &&
      formData.companiesHouseNumber.length !== 8
    ) {
      newErrors.companiesHouseNumber =
        "UK Companies House number must be 8 digits";
    }

    if (!formData.consentDataFetch) {
      newErrors.consentDataFetch =
        "You must consent to data fetching to continue";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async () => {
    if (!validateForm()) {
      toast.error("Validation Error", {
        description: "Please fix the errors in the form",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Check for duplicate company name/number
      const { data: existingCompanies } = await supabase
        .from("companies")
        .select("id, company_name, companies_house_number")
        .or(
          `company_name.ilike.${formData.companyName},companies_house_number.eq.${formData.companiesHouseNumber}`
        )
        .limit(1);

      if (existingCompanies && existingCompanies.length > 0) {
        toast.error("Company Already Exists", {
          description:
            "A company with this name or number already exists in the system.",
        });
        setIsLoading(false);
        return;
      }

      // Trigger background prefill job
      try {
        const prefillData = await api.prefillCompanyData({
          companyName: formData.companyName,
          companyNumber: formData.companiesHouseNumber,
          websiteUrl: formData.websiteUrl,
        });

        console.log("Prefill data received:", prefillData);
        toast.success("Data Retrieved!", {
          description:
            "We've prefilled your profile with public data. Please review in the next step.",
        });
        onNext(formData, prefillData as PrefillData);
      } catch (prefillError) {
        console.error("Prefill error:", prefillError);
        toast.info("Warning", {
          description:
            "Could not auto-fetch data. You can still continue and fill manually.",
        });
        onNext(formData, null);
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error", {
        description: "An error occurred. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipAutoFill = () => {
    if (!validateForm()) {
      toast.error("Validation Error", {
        description: "Please fix the errors in the form",
      });
      return;
    }

    onNext(formData, null);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-4">
          <Building2 className="w-10 h-10 text-primary" />
          <div>
            <CardTitle className="text-2xl">Step 1: Company Basics</CardTitle>
            <p className="text-muted-foreground mt-1">
              Let&apos;s start with essential information
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="companyName">
              Company Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="companyName"
              value={formData.companyName}
              onChange={(e) =>
                setFormData({ ...formData, companyName: e.target.value })
              }
              placeholder="Enter your company name"
              className={errors.companyName ? "border-destructive" : ""}
            />
            {errors.companyName && (
              <p className="text-sm text-destructive">{errors.companyName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="companiesHouseNumber">
              Companies House Number (optional, 8 digits if UK)
            </Label>
            <Input
              id="companiesHouseNumber"
              value={formData.companiesHouseNumber}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  companiesHouseNumber: e.target.value,
                })
              }
              placeholder="e.g., 12345678"
              maxLength={8}
              className={
                errors.companiesHouseNumber ? "border-destructive" : ""
              }
            />
            {errors.companiesHouseNumber && (
              <p className="text-sm text-destructive">
                {errors.companiesHouseNumber}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="websiteUrl">Website URL (optional)</Label>
            <Input
              id="websiteUrl"
              value={formData.websiteUrl}
              onChange={(e) =>
                setFormData({ ...formData, websiteUrl: e.target.value })
              }
              placeholder="https://yourcompany.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPerson">
              Contact Person <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contactPerson"
              value={formData.contactPerson}
              onChange={(e) =>
                setFormData({ ...formData, contactPerson: e.target.value })
              }
              placeholder="Full name"
              className={errors.contactPerson ? "border-destructive" : ""}
            />
            {errors.contactPerson && (
              <p className="text-sm text-destructive">{errors.contactPerson}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactEmail">
              Contact Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contactEmail"
              type="email"
              value={formData.contactEmail}
              onChange={(e) =>
                setFormData({ ...formData, contactEmail: e.target.value })
              }
              placeholder="contact@company.com"
              className={errors.contactEmail ? "border-destructive" : ""}
            />
            {errors.contactEmail && (
              <p className="text-sm text-destructive">{errors.contactEmail}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPhone">Contact Phone (optional)</Label>
            <Input
              id="contactPhone"
              value={formData.contactPhone}
              onChange={(e) =>
                setFormData({ ...formData, contactPhone: e.target.value })
              }
              placeholder="01234 567890"
            />
          </div>
        </div>

        <div className="flex items-start space-x-2 p-4 bg-muted/50 rounded-lg">
          <Checkbox
            id="consent"
            checked={formData.consentDataFetch}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, consentDataFetch: checked as boolean })
            }
          />
          <div className="space-y-1 leading-none">
            <label
              htmlFor="consent"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              I allow AI-Powered CCM to fetch public data to prefill my profile{" "}
              <span className="text-destructive">*</span>
            </label>
            <p className="text-xs text-muted-foreground">
              We&apos;ll retrieve information from Companies House, Endole, and
              your website to help complete your profile automatically.
            </p>
            {errors.consentDataFetch && (
              <p className="text-sm text-destructive">
                {errors.consentDataFetch}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-4 justify-end pt-4">
          <Button
            variant="outline"
            onClick={handleSkipAutoFill}
            disabled={isLoading}
          >
            Skip Auto-Fill
          </Button>
          <Button onClick={handleContinue} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching Data...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
