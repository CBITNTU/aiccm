"use client";

import { useAuth } from "@/hooks/useAuth";
import { Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function OnboardingBanner() {
  const t = useTranslations("OnboardingBanner");
  const { isOnboarding } = useAuth();

  if (!isOnboarding) return null;

  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-100" />
          <span className="font-medium">
            {t("message")}
          </span>
        </div>
        <Button
          asChild
          size="sm"
          className="bg-white text-blue-700 hover:bg-blue-50 font-semibold"
        >
          <Link href="/onboarding" className="flex items-center gap-1">
            {t("continueOnboarding")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
