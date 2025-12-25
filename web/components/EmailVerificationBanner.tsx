"use client";

import { useState } from "react";
import { Mail, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "success" | "error">("idle");

  // Don't show if user is verified or banner is dismissed
  if (!user || user.email_confirmed_at || dismissed) {
    return null;
  }

  const handleResendVerification = async () => {
    setIsResending(true);
    setResendStatus("idle");

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        setResendStatus("success");
      } else {
        setResendStatus("error");
      }
    } catch {
      setResendStatus("error");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="bg-blue-50 border-b border-blue-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium text-blue-800">
                Please verify your email address.
              </span>{" "}
              <span className="text-blue-700">
                Check your inbox for a verification link.
              </span>
              {resendStatus === "success" && (
                <span className="text-green-700 ml-2">
                  Verification email sent!
                </span>
              )}
              {resendStatus === "error" && (
                <span className="text-red-700 ml-2">
                  Failed to send. Please try again.
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResendVerification}
              disabled={isResending}
              className="text-blue-700 border-blue-300 hover:bg-blue-100"
            >
              {isResending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Sending...
                </>
              ) : (
                "Resend email"
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
              className="text-blue-700 hover:bg-blue-100 px-2"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Dismiss</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
