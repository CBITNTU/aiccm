"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, Building2, Loader2, Search, Users, FileText } from "lucide-react";

interface AccountTypeStepProps {
  onComplete: (accountType: "individual" | "business") => void;
}

export function AccountTypeStep({ onComplete }: AccountTypeStepProps) {
  const [selectedType, setSelectedType] = useState<"individual" | "business" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!selectedType) {
      setError("Please select an account type");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 3,
          data: { accountType: selectedType },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save account type");
      }

      onComplete(selectedType);
    } catch (error) {
      console.error("Error saving account type:", error);
      const message =
        error instanceof Error ? error.message : "Failed to save";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Card className="card-professional">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">How would you like to use AICCM?</CardTitle>
          <p className="text-muted-foreground mt-2">
            Choose the option that best describes your needs
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Individual Option */}
            <button
              type="button"
              onClick={() => setSelectedType("individual")}
              className={`relative flex flex-col items-start p-6 rounded-lg border-2 transition-all text-left ${
                selectedType === "individual"
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/50 hover:bg-muted/30"
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
                  selectedType === "individual"
                    ? "bg-primary/10"
                    : "bg-muted"
                }`}
              >
                <User
                  className={`w-6 h-6 ${
                    selectedType === "individual"
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                />
              </div>
              <h3 className="font-semibold text-lg mb-2">Individual</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Browse and explore tenders without company affiliation
              </p>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <Search className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Search and view public tenders</span>
                </li>
                <li className="flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Access tender details and analysis</span>
                </li>
                <li className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Join a company later if needed</span>
                </li>
              </ul>
              {selectedType === "individual" && (
                <div className="absolute top-4 right-4 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-primary-foreground"
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
                </div>
              )}
            </button>

            {/* Business Option */}
            <button
              type="button"
              onClick={() => setSelectedType("business")}
              className={`relative flex flex-col items-start p-6 rounded-lg border-2 transition-all text-left ${
                selectedType === "business"
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/50 hover:bg-muted/30"
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
                  selectedType === "business"
                    ? "bg-primary/10"
                    : "bg-muted"
                }`}
              >
                <Building2
                  className={`w-6 h-6 ${
                    selectedType === "business"
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                />
              </div>
              <h3 className="font-semibold text-lg mb-2">Business</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Register your company or join an existing one
              </p>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Get matched with relevant tenders</span>
                </li>
                <li className="flex items-start gap-2">
                  <Users className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Collaborate with team members</span>
                </li>
                <li className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Build your company profile</span>
                </li>
              </ul>
              {selectedType === "business" && (
                <div className="absolute top-4 right-4 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-primary-foreground"
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
                </div>
              )}
            </button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full btn-cta"
            onClick={handleContinue}
            disabled={!selectedType || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
