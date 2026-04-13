"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("Onboarding.pendingApproval");
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
    const cn = companyName ?? "";
    switch (signupType) {
      case "new-company":
        return {
          title: t("newCompany.title"),
          description: t("newCompany.description", { companyName: cn }),
          steps: [
            t("newCompany.step1"),
            t("newCompany.step2"),
            t("newCompany.step3"),
          ],
        };
      case "join-company":
        return {
          title: t("joinCompany.title"),
          description: t("joinCompany.description", { companyName: cn }),
          steps: [
            t("joinCompany.step1"),
            t("joinCompany.step2"),
            t("joinCompany.step3"),
          ],
        };
      default:
        return {
          title: t("individual.title"),
          description: t("individual.description"),
          steps: [
            t("individual.step1"),
            t("individual.step2"),
            t("individual.step3"),
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
            <h3 className="font-medium text-foreground">
              {t("shared.whatHappensNext")}
            </h3>
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
                  {t("shared.keepEyeOnInbox")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("shared.emailHint")}
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
                  {t("shared.pleaseWait")}
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {t("shared.continue")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
