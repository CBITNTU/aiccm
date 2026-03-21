"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, RefreshCw, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface EmailVerificationStepProps {
  email: string;
  onVerified: () => void;
}

export function EmailVerificationStep({
  email,
  onVerified,
}: EmailVerificationStepProps) {
  const [isResending, setIsResending] = useState(false);
  const [isPolling, setIsPolling] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Poll for verification status
  useEffect(() => {
    if (!isPolling) return;

    const checkVerification = async () => {
      try {
        const response = await fetch("/api/onboarding/check-verification");
        const data = await response.json();

        if (data.verified) {
          setIsPolling(false);
          onVerified();
        }
      } catch (error) {
        console.error("Error checking verification:", error);
      }
    };

    // Check immediately
    checkVerification();

    // Then poll every 3 seconds
    const interval = setInterval(checkVerification, 3000);

    return () => clearInterval(interval);
  }, [isPolling, onVerified]);

  const handleResendEmail = async () => {
    setIsResending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to resend verification email");
      }

      toast.success("Verification email sent!", {
        description: "Please check your inbox (and spam folder).",
      });
    } catch (error) {
      console.error("Error resending verification:", error);
      const message =
        error instanceof Error ? error.message : "Failed to send email";
      setError(message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <Card className="card-professional">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mx-auto mb-4 flex items-center justify-center">
            <Mail className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-2xl">Verify Your Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <p className="text-muted-foreground mb-2">
              We&apos;ve sent a verification link to:
            </p>
            <p className="font-medium text-foreground text-lg">{email}</p>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg text-center">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Waiting for verification...</span>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Click the link in your email to verify your address. Once
              verified, this page will automatically update.
            </p>

            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg text-sm">
              <CheckCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span className="text-amber-800 dark:text-amber-200">
                Check your spam folder if you don&apos;t see the email
              </span>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="pt-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResendEmail}
              disabled={isResending}
            >
              {isResending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Resend Verification Email
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
