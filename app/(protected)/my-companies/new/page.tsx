"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { CreateJoinCompanyForm } from "@/components/company/CreateJoinCompanyForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, Clock } from "lucide-react";

export default function NewCompanyPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [submitResult, setSubmitResult] = useState<{
    action: "create" | "join";
    companyId?: string;
    companyName: string;
  } | null>(null);

  const handleSuccess = (result: {
    action: "create" | "join";
    companyId?: string;
    companyName: string;
  }) => {
    setSubmitResult(result);
  };

  const handleGoToCompanies = () => {
    router.push("/my-companies");
  };

  const handleAddAnother = () => {
    setSubmitResult(null);
  };

  // Show success state after submission
  if (submitResult) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="card-professional">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full mx-auto mb-4 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">
              {submitResult.action === "create"
                ? "Company Created!"
                : "Request Submitted!"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">
                {submitResult.companyName}
              </p>
              {submitResult.action === "create" ? (
                <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Pending admin approval</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Awaiting company admin approval</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              {submitResult.action === "create" ? (
                <p>
                  Your company has been submitted for review. A platform administrator
                  will review your submission and approve it soon. You&apos;ll receive
                  a notification once your company is active.
                </p>
              ) : (
                <p>
                  Your request to join has been sent to the company administrators.
                  Once approved by the company admin and platform admin, you&apos;ll
                  be added as a member of the company.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <Button onClick={handleGoToCompanies} className="w-full">
                Go to My Companies
              </Button>
              <Button
                variant="outline"
                onClick={handleAddAnother}
                className="w-full"
              >
                Add Another Company
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/my-companies")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to My Companies
        </Button>
      </div>

      <CreateJoinCompanyForm
        userEmail={user?.email || ""}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
