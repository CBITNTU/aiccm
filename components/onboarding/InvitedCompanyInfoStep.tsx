"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Loader2, UserPlus } from "lucide-react";
import { ONBOARDING_STEPS } from "@/lib/onboarding";

interface InvitedCompanyInfoStepProps {
  companyName: string;
  inviterName: string;
  onComplete: () => void;
}

export function InvitedCompanyInfoStep({
  companyName,
  inviterName,
  onComplete,
}: InvitedCompanyInfoStepProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Mark this step as complete and move to the final step
      const response = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: ONBOARDING_STEPS.COMPANY_INFO,
          data: {
            action: "invited-confirm",
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to continue");
      }

      onComplete();
    } catch (error) {
      console.error("Error confirming invitation:", error);
      const message =
        error instanceof Error ? error.message : "Failed to continue";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <Card className="card-professional">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mx-auto mb-4 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-2xl">You&apos;re Joining {companyName}</CardTitle>
          <p className="text-muted-foreground mt-2">
            <UserPlus className="w-4 h-4 inline-block mr-1" />
            {inviterName} invited you to join their team
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{companyName}</p>
                <p className="text-sm text-muted-foreground">Your team</p>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-2">
            <p>After you continue:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>A platform administrator will review your membership</li>
              <li>You&apos;ll receive access once approved</li>
              <li>You can then collaborate with your team</li>
            </ul>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <Button
            onClick={handleContinue}
            className="w-full btn-cta"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
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
