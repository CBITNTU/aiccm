"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Clock, Mail, Loader2 } from "lucide-react";
import { ONBOARDING_STEPS } from "@/lib/onboarding";

interface PendingApprovalStepProps {
  signupType?: string | null;
  companyName?: string | null;
}

export function PendingApprovalStep({
  signupType,
  companyName,
}: PendingApprovalStepProps) {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleComplete = async () => {
    setIsLoading(true);

    try {
      // Mark onboarding as complete
      const response = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: ONBOARDING_STEPS.COMPLETE }),
      });

      // Refresh auth profile state before navigation
      if (response.ok) {
        await refreshProfile();
      }

      // Redirect to pending approval page
      router.push("/pending-approval");
    } catch (error) {
      console.error("Error completing onboarding:", error);
      // Still redirect even if there's an error
      router.push("/pending-approval");
    }
  };

  // Determine the message based on signup type
  const getMessage = () => {
    switch (signupType) {
      case "new-company":
        return {
          title: "Company Registration Complete!",
          description: `Your company "${companyName}" has been registered and is pending approval.`,
          steps: [
            "Our team will review your company information",
            "You'll receive an email once your account is approved",
            "After approval, you can complete your company profile and start exploring tenders",
          ],
        };
      case "join-company":
        return {
          title: "Join Request Submitted!",
          description: `Your request to join "${companyName}" has been sent to the company administrator.`,
          steps: [
            "The company administrator will review your request",
            "Our platform team will also verify your account",
            "You'll receive an email once both approvals are complete",
          ],
        };
      default:
        return {
          title: "Profile Complete!",
          description: "Your individual account has been set up and is pending approval.",
          steps: [
            "Our team will review your account",
            "You'll receive an email once your account is approved",
            "After approval, you can explore tenders and join companies",
          ],
        };
    }
  };

  const content = getMessage();

  return (
    <div className="w-full max-w-lg mx-auto">
      <Card className="card-professional">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900 rounded-full mx-auto mb-4 flex items-center justify-center">
            <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-2xl">{content.title}</CardTitle>
          <p className="text-muted-foreground mt-2">{content.description}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-medium text-foreground">What happens next?</h3>
            <ul className="space-y-3">
              {content.steps.map((step, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-medium text-primary">
                      {index + 1}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">{step}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Keep an eye on your inbox
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  We&apos;ll send you an email as soon as your account is approved.
                  This usually takes 1-2 business days.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button
              onClick={handleComplete}
              className="w-full btn-cta"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Please wait...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Continue
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
