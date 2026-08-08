"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { Lock, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { Header } from "@/components/layout/Header";

const MIN_PASSWORD_LENGTH = 6;

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Header variant="landing" />
      <div className="max-w-md mx-auto px-4 pt-20 pb-16">
        <div className="text-center mb-8">
          <BrandLogo className="h-10 mx-auto mb-4" priority />
        </div>
        {children}
      </div>
    </div>
  );
}

function ResetPasswordContent() {
  const t = useTranslations("Auth.resetPassword");
  const searchParams = useSearchParams();
  // Better-Auth's GET /api/auth/reset-password/:token redirects here with
  // ?token=... when the token is live, or ?error=INVALID_TOKEN when it is not.
  const token = searchParams.get("token");
  const tokenError = searchParams.get("error");

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError(t("errorPasswordsMismatch"));
      setIsLoading(false);
      return;
    }

    if (formData.password.length < MIN_PASSWORD_LENGTH) {
      setError(t("errorPasswordTooShort"));
      setIsLoading(false);
      return;
    }

    try {
      const result = await authClient.resetPassword({
        newPassword: formData.password,
        token: token!,
      });

      if (result.error) {
        throw new Error(result.error.message || t("errorFallback"));
      }

      setFormData({ password: "", confirmPassword: "" });
      setSuccess(true);
    } catch (error: unknown) {
      console.error("Password reset error:", error);
      setError(error instanceof Error ? error.message : t("errorFallback"));
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <PageShell>
        <Card className="card-professional">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full mx-auto mb-4 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">{t("successTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground text-center">
              {t("successBody")}
            </p>
            <Button className="w-full btn-cta" asChild>
              <Link href="/auth">{t("goToSignIn")}</Link>
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (!token || tokenError) {
    return (
      <PageShell>
        <Card className="card-professional">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full mx-auto mb-4 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">{t("invalidTokenTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground text-center">
              {t("invalidTokenBody")}
            </p>
            <Button className="w-full btn-cta" asChild>
              <Link href="/auth/forgot-password">{t("requestNewLink")}</Link>
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
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
              <Label htmlFor="reset-password">{t("passwordLabel")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="reset-password"
                  type="password"
                  placeholder={t("passwordPlaceholder")}
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="pl-10"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-confirm">{t("confirmPasswordLabel")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="reset-confirm"
                  type="password"
                  placeholder={t("confirmPasswordPlaceholder")}
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      confirmPassword: e.target.value,
                    })
                  }
                  className="pl-10"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
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
        </CardContent>
      </Card>
    </PageShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <Card className="card-professional">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </CardContent>
          </Card>
        </PageShell>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
