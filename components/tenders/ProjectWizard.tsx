"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";
import { TenderSelectionStep } from "./TenderSelectionStep";
import { TaxonomyTreeSelector } from "./TaxonomyTreeSelector";
import { CompanySelectionStep } from "./CompanySelectionStep";
import { ProjectSummaryStep } from "./ProjectSummaryStep";
import type { Database } from "@/lib/supabase/types";

type Taxonomy = Database["public"]["Tables"]["taxonomies"]["Row"];
type Company = Database["public"]["Tables"]["companies"]["Row"];

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
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(initialTenderId);
  const [selectedTaxonomies, setSelectedTaxonomies] = useState<string[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<Company[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");

  const steps = [
    { number: 1, title: "Select Tender", description: "Choose the tender for this project" },
    { number: 2, title: "Select Capabilities", description: "Choose the capabilities needed for this project" },
    { number: 3, title: "Select Companies", description: "Choose companies with the selected capabilities" },
    { number: 4, title: "Review & Create", description: "Review your selections and create the project" },
  ];

  const handleTaxonomySelection = (taxonomyIds: string[]) => {
    setSelectedTaxonomies(taxonomyIds);
  };

  const handleCompanySelection = (companies: Company[]) => {
    setSelectedCompanies(companies);
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!selectedTenderId) {
        return; // Can't proceed without selecting a tender
      }
    }
    if (currentStep === 2) {
      if (selectedTaxonomies.length === 0) {
        return; // Can't proceed without selecting taxonomies
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
    if (currentStep === 2) return selectedTaxonomies.length > 0;
    if (currentStep === 3) return selectedCompanies.length > 0;
    return true;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Build Your Project Team</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Step {currentStep} of {steps.length}: {steps[currentStep - 1].title}
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
            <TaxonomyTreeSelector
              selectedTaxonomies={selectedTaxonomies}
              onSelectionChange={handleTaxonomySelection}
            />
          )}

          {currentStep === 3 && (
            <CompanySelectionStep
              selectedTaxonomyIds={selectedTaxonomies}
              selectedCompanies={selectedCompanies}
              onSelectionChange={handleCompanySelection}
            />
          )}

          {currentStep === 4 && (
            <ProjectSummaryStep
              selectedTenderId={selectedTenderId}
              selectedTaxonomies={selectedTaxonomies}
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

