"use client";

import { useAuth } from "@/hooks/useAuth";
import { Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function OnboardingBanner() {
  const { isOnboarding } = useAuth();

  if (!isOnboarding) return null;

  return (
    <div className="bg-gradient-to-r from-violet-500 to-purple-600 text-white px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-yellow-300" />
          <span className="font-medium">
            Complete your onboarding to unlock all features and get approved by
            the platform admin.
          </span>
        </div>
        <Button
          asChild
          size="sm"
          className="bg-white text-purple-700 hover:bg-purple-50 font-semibold"
        >
          <Link href="/onboarding" className="flex items-center gap-1">
            Continue Onboarding
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
