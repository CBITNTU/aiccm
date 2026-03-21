"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- step/result types */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { TenderSelectionStep } from "./TenderSelectionStep";
import { CapabilityTreeSelector } from "./CapabilityTreeSelector";
import { CompanySelectionStep } from "./CompanySelectionStep";
import { ProjectSummaryStep } from "./ProjectSummaryStep";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

interface Company {
  id: string;
  companyName: string;
  postcode?: string | null;
  [key: string]: unknown;
}

interface ProjectWizardProps {
  onClose: () => void;
  onProjectCreated: (projectId: string) => void;
  leadCompanyId: string;
  initialTenderId?: string | null;
}

export function ProjectWizard({
  onClose,
  onProjectCreated,
  leadCompanyId,
  initialTenderId = null,
}: ProjectWizardProps) {
  const [currentStep, setCurrentStep] = useState(initialTenderId ? 2 : 1);
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(
    initialTenderId,
  );
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(
    [],
  );
  const [selectedCompanies, setSelectedCompanies] = useState<Company[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
  const [aiSuggestedCapabilities, setAiSuggestedCapabilities] = useState<
    string[]
  >([]);

  const steps = [
    {
      number: 1,
      title: "Select Tender",
      description: "Choose the tender for this project",
    },
    {
      number: 2,
      title: "Select Capabilities",
      description: "Choose the capabilities needed for this project",
    },
    {
      number: 3,
      title: "Select Companies",
      description: "Choose companies with the selected capabilities",
    },
    {
      number: 4,
      title: "Review & Create",
      description: "Review your selections and create the project",
    },
  ];

  const handleCapabilitySelection = (capabilityIds: string[]) => {
    setSelectedCapabilities(capabilityIds);
  };

  const handleCompanySelection = (companies: Company[]) => {
    setSelectedCompanies(companies);
  };

  // Fetch AI-suggested capabilities when entering step 2 with a selected tender
  useEffect(() => {
    const fetchSuggestedCapabilities = async () => {
      if (!selectedTenderId || currentStep !== 2) return;

      // Only fetch if we don't have any selected capabilities yet (first time)
      if (selectedCapabilities.length > 0) return;

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

    // Small delay to ensure step transition is complete
    const timer = setTimeout(() => {
      fetchSuggestedCapabilities();
    }, 100);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run on step/tender change
  }, [selectedTenderId, currentStep]);

  // Reset AI suggestions when tender changes (but keep if user already selected)
  useEffect(() => {
    if (selectedTenderId && selectedCapabilities.length === 0) {
      setAiSuggestedCapabilities([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when tender changes
  }, [selectedTenderId]);

  const handleNext = () => {
    if (currentStep === 1) {
      if (!selectedTenderId) {
        return; // Can't proceed without selecting a tender
      }
    }
    if (currentStep === 2) {
      if (selectedCapabilities.length === 0) {
        return; // Can't proceed without selecting capabilities
      }
    }
    if (currentStep === 3) {
      if (selectedCompanies.length === 0) {
        return; // Can't proceed without selecting companies
      }
    }
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
  };

  const canProceed = () => {
    if (currentStep === 1) return selectedTenderId !== null;
    if (currentStep === 2) return selectedCapabilities.length > 0;
    if (currentStep === 3) return selectedCompanies.length > 0;
    return true;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">
                Build Your Project Team
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Step {currentStep} of {steps.length}:{" "}
                {steps[currentStep - 1].title}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 mt-6">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center flex-1">
                <div className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      currentStep > step.number
                        ? "bg-primary text-primary-foreground"
                        : currentStep === step.number
                          ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {currentStep > step.number ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      step.number
                    )}
                  </div>
                  <div className="flex-1 hidden sm:block">
                    <div
                      className={`text-sm font-medium ${
                        currentStep >= step.number
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {step.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {step.description}
                    </div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-2 ${
                      currentStep > step.number ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-6">
          {currentStep === 1 && (
            <TenderSelectionStep
              selectedTenderId={selectedTenderId}
              onTenderSelect={setSelectedTenderId}
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
              {aiSuggestedCapabilities.length > 0 && !isLoadingCapabilities && (
                <div className="flex items-center gap-2 text-sm bg-primary/10 text-primary p-3 rounded-lg">
                  <Sparkles className="w-4 h-4" />
                  <span>
                    AI suggested {aiSuggestedCapabilities.length} capabilities.
                    You can edit the selection below.
                  </span>
                </div>
              )}
              <CapabilityTreeSelector
                selectedCapabilities={selectedCapabilities}
                onSelectionChange={handleCapabilitySelection}
              />
            </div>
          )}

          {currentStep === 3 && (
            <CompanySelectionStep
              selectedCapabilityIds={selectedCapabilities}
              selectedCompanies={selectedCompanies}
              onSelectionChange={handleCompanySelection}
            />
          )}

          {currentStep === 4 && (
            <ProjectSummaryStep
              selectedTenderId={selectedTenderId}
              selectedCapabilities={selectedCapabilities}
              selectedCompanies={selectedCompanies}
              projectName={projectName}
              projectDescription={projectDescription}
              onProjectNameChange={setProjectName}
              onProjectDescriptionChange={setProjectDescription}
              leadCompanyId={leadCompanyId}
              onProjectCreated={onProjectCreated}
              onClose={onClose}
            />
          )}
        </CardContent>

        {currentStep < 4 && (
          <div className="border-t p-4 flex justify-between">
            <Button
              variant="outline"
              onClick={currentStep === 1 ? onClose : handleBack}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              {currentStep === 1 ? "Cancel" : "Back"}
            </Button>
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
