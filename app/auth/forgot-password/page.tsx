"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { Header } from "@/components/layout/Header";

export default function ForgotPasswordPage() {
  const t = useTranslations("Auth.forgotPassword");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Better-Auth answers with `status: true` whether or not the address has
      // an account, and we mirror that: the success screen must not reveal
      // which emails are registered.
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: "/auth/reset-password",
      });

      if (result.error) {
        throw new Error(result.error.message || t("errorFallback"));
      }

      setSubmittedEmail(email);
      setEmail("");
    } catch (error: unknown) {
      console.error("Password reset request error:", error);
      setError(error instanceof Error ? error.message : t("errorFallback"));
    } finally {
      setIsLoading(false);
    }
  };

  if (submittedEmail) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="landing" />
        <div className="max-w-md mx-auto px-4 pt-20 pb-16">
          <Card className="card-professional">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full mx-auto mb-4 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl">{t("successTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <p className="text-muted-foreground mb-2">
                  {t("successSentTo")}
                </p>
                <p className="font-medium text-foreground text-lg break-all">
                  {submittedEmail}
                </p>
              </div>

              <p className="text-sm text-muted-foreground">
                {t("successBody")}
              </p>

              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg text-sm">
                <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="text-amber-800 dark:text-amber-200">
                  {t("successExpiry")}
                </span>
              </div>

              <Button variant="outline" className="w-full" asChild>
                <Link href="/auth">{t("backToSignIn")}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header variant="landing" />

      <div className="max-w-md mx-auto px-4 pt-20 pb-16">
        <div className="text-center mb-8">
          <BrandLogo className="h-10 mx-auto mb-4" priority />
        </div>

        <Card className="card-professional">
          <CardHeader>
            <CardTitle className="text-foreground">{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">{t("emailLabel")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full btn-cta"
                disabled={isLoading}
              >
                {isLoading ? t("submitLoading") : t("submit")}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Link
                href="/auth"
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                {t("backToSignIn")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
