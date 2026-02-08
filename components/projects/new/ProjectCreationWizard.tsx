"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- step/result types */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2, Sparkles, X } from "lucide-react";
import { WizardStepProgress, type WizardStep } from "./WizardStepProgress";
import { TenderStep } from "./steps/TenderStep";
import { CapabilitiesStep } from "./steps/CapabilitiesStep";
import { CompaniesStep } from "./steps/CompaniesStep";
import { ReviewStep } from "./steps/ReviewStep";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface ProjectCreationWizardProps {
  initialTenderId?: string;
  initialCompanyId?: string;
}

const WIZARD_STEPS: WizardStep[] = [
  {
    number: 1,
    title: "Select Tender",
    description: "Choose the tender for this project",
  },
  {
    number: 2,
    title: "Select Capabilities",
    description: "Choose the capabilities needed",
  },
  {
    number: 3,
    title: "Select Companies",
    description: "Choose companies with matching capabilities",
  },
  {
    number: 4,
    title: "Review & Create",
    description: "Review and create the project",
  },
];

export function ProjectCreationWizard({
  initialTenderId,
  initialCompanyId,
}: ProjectCreationWizardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  // Determine starting step based on whether we have a tender ID
  const [currentStep, setCurrentStep] = useState(initialTenderId ? 2 : 1);
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(
    initialTenderId || null,
  );
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(
    [],
  );
  const [selectedCompanies, setSelectedCompanies] = useState<Company[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");

  // Lead company state
  const [leadCompanyId, setLeadCompanyId] = useState<string | null>(
    initialCompanyId || null,
  );
  const [userCompanies, setUserCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  // AI suggestion state
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
  const [aiSuggestedCapabilities, setAiSuggestedCapabilities] = useState<
    string[]
  >([]);

  // Fetch user's companies on mount
  useEffect(() => {
    const fetchCompanies = async () => {
      if (!user) {
        setLoadingCompanies(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("companies")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setUserCompanies(data || []);

        // Auto-select company if initialCompanyId provided, or select first company
        if (initialCompanyId) {
          const company = data?.find((c) => c.id === initialCompanyId);
          if (company) {
            setLeadCompanyId(company.id);
          } else if (data && data.length > 0) {
            setLeadCompanyId(data[0].id);
          }
        } else if (data && data.length > 0 && !leadCompanyId) {
          setLeadCompanyId(data[0].id);
        }
      } catch (error) {
        console.error("Error fetching companies:", error);
        toast.error("Failed to load companies");
      } finally {
        setLoadingCompanies(false);
      }
    };

    fetchCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Fetch AI-suggested capabilities when entering step 2 with a selected tender
  useEffect(() => {
    const fetchSuggestedCapabilities = async () => {
      if (!selectedTenderId || currentStep !== 2) return;

      // Only fetch if we don't have any selected capabilities yet
      if (selectedCapabilities.length > 0) return;

      if (!user) {
        console.warn("User not authenticated, skipping AI suggestions");
        return;
      }

      setIsLoadingCapabilities(true);
      try {
        const result = await api.suggestCapabilities(selectedTenderId);

        if (
          result.suggestedCapabilityIds &&
          result.suggestedCapabilityIds.length > 0
        ) {
          setSelectedCapabilities(result.suggestedCapabilityIds);
          setAiSuggestedCapabilities(result.suggestedCapabilityIds);
          toast.success(
            `AI suggested ${result.suggestedCapabilityIds.length} capabilities. You can edit the selection.`,
          );
        } else {
          toast.info(
            "No specific capabilities were suggested. Please select manually.",
          );
        }
      } catch (error: any) {
        console.error("Error fetching suggested capabilities:", error);
        if (error?.status === 401) {
          toast.error(
            "Please log in to use AI suggestions. You can still select capabilities manually.",
          );
        } else {
          toast.error(
            "Failed to get AI suggestions. Please select capabilities manually.",
          );
        }
      } finally {
        setIsLoadingCapabilities(false);
      }
    };

    const timer = setTimeout(() => {
      fetchSuggestedCapabilities();
    }, 100);

    return () => clearTimeout(timer);
  }, [selectedTenderId, currentStep, user, selectedCapabilities.length]);

  // Reset AI suggestions when tender changes
  useEffect(() => {
    if (selectedTenderId && selectedCapabilities.length === 0) {
      setAiSuggestedCapabilities([]);
    }
  }, [selectedTenderId, selectedCapabilities.length]);

  const handleCapabilitySelection = (capabilityIds: string[]) => {
    setSelectedCapabilities(capabilityIds);
  };

  const handleCompanySelection = (companies: Company[]) => {
    setSelectedCompanies(companies);
  };

  const handleNext = () => {
    if (currentStep === 1 && !selectedTenderId) {
      toast.error("Please select a tender to continue");
      return;
    }
    if (currentStep === 2 && selectedCapabilities.length === 0) {
      toast.error("Please select at least one capability");
      return;
    }
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep === 1) {
      router.back();
    } else {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (step: number) => {
    // Only allow going back to completed steps
    if (step < currentStep) {
      setCurrentStep(step);
    }
  };

  const handleClose = () => {
    router.back();
  };

  const handleProjectCreated = (projectId: string) => {
    // Navigate to the project with the selected company
    const params = new URLSearchParams();
    params.set("projectId", projectId);
    if (leadCompanyId) {
      params.set("companyId", leadCompanyId);
    }
    router.push(`/projects?${params.toString()}`);
  };

  const handleSkipTender = () => {
    setSelectedTenderId(null);
    setCurrentStep(2);
  };

  const canProceed = () => {
    if (currentStep === 1) return selectedTenderId !== null;
    if (currentStep === 2) return selectedCapabilities.length > 0;
    // Step 3 (companies): allow proceeding with just the lead company (no partners required)
    if (currentStep === 3) return true;
    return true;
  };

  if (loadingCompanies) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (userCompanies.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <h2 className="text-xl font-semibold mb-2">No Company Found</h2>
              <p className="text-muted-foreground mb-6">
                You need to create a company before you can start a project.
              </p>
              <Button onClick={() => router.push("/onboarding")}>
                Create Company
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div className="container mx-auto px-4 py-6 flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 shrink-0">
          <div>
            <h1 className="text-2xl font-bold">Build Your Project Team</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Step {currentStep} of {WIZARD_STEPS.length}:{" "}
              {WIZARD_STEPS[currentStep - 1].title}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Left sidebar - Step progress */}
          <div className="hidden lg:block">
            <div className="sticky top-6">
              <Card>
                <CardContent className="p-6">
                  <WizardStepProgress
                    steps={WIZARD_STEPS}
                    currentStep={currentStep}
                    onStepClick={handleStepClick}
                  />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Right content - Current step */}
          <div className="flex flex-col min-h-0 h-full gap-6">
            {/* Mobile step indicator */}
            <div className="flex items-center gap-2 lg:hidden overflow-x-auto pb-2 shrink-0">
              {WIZARD_STEPS.map((step) => (
                <div
                  key={step.number}
                  className={`flex items-center gap-2 shrink-0 ${
                    currentStep === step.number
                      ? "text-primary"
                      : currentStep > step.number
                        ? "text-primary/60"
                        : "text-muted-foreground"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      currentStep >= step.number
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {step.number}
                  </div>
                  <span className="text-sm font-medium">{step.title}</span>
                  {step.number < WIZARD_STEPS.length && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>

            {/* Step content */}
            <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <CardContent className="p-6 flex-1 overflow-y-auto">
                {currentStep === 1 && (
                  <TenderStep
                    selectedTenderId={selectedTenderId}
                    onTenderSelect={setSelectedTenderId}
                    onSkip={handleSkipTender}
                  />
                )}

                {currentStep === 2 && (
                  <div className="space-y-4">
                    {isLoadingCapabilities && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>
                          AI is analyzing the tender and suggesting relevant
                          capabilities...
                        </span>
                      </div>
                    )}
                    {aiSuggestedCapabilities.length > 0 &&
                      !isLoadingCapabilities && (
                        <div className="flex items-center gap-2 text-sm bg-primary/10 text-primary p-3 rounded-lg">
                          <Sparkles className="w-4 h-4" />
                          <span>
                            AI suggested {aiSuggestedCapabilities.length}{" "}
                            capabilities. You can edit the selection below.
                          </span>
                        </div>
                      )}
                    <CapabilitiesStep
                      selectedCapabilities={selectedCapabilities}
                      onSelectionChange={handleCapabilitySelection}
                    />
                  </div>
                )}

                {currentStep === 3 && (
                  <CompaniesStep
                    selectedCapabilityIds={selectedCapabilities}
                    selectedCompanies={selectedCompanies}
                    onSelectionChange={handleCompanySelection}
                  />
                )}

                {currentStep === 4 && leadCompanyId && (
                  <ReviewStep
                    selectedTenderId={selectedTenderId}
                    selectedCapabilities={selectedCapabilities}
                    selectedCompanies={selectedCompanies}
                    projectName={projectName}
                    projectDescription={projectDescription}
                    onProjectNameChange={setProjectName}
                    onProjectDescriptionChange={setProjectDescription}
                    leadCompanyId={leadCompanyId}
                    onProjectCreated={handleProjectCreated}
                    onBack={handleBack}
                  />
                )}
              </CardContent>
            </Card>

            {/* Navigation footer */}
            {currentStep < 4 && (
              <div className="flex justify-between shrink-0 pt-4 border-t bg-background">
                <Button variant="outline" onClick={handleBack}>
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  {currentStep === 1 ? "Cancel" : "Back"}
                </Button>
                <Button onClick={handleNext} disabled={!canProceed()}>
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
