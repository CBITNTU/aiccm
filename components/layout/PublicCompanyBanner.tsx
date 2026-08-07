"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/layout/BrandLogo";

export function PublicCompanyBanner() {
  const t = useTranslations("PublicCompanyBanner");
  return (
    <header className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <BrandLogo className="h-8" priority />
            <span className="hidden sm:block border-l border-border pl-3 text-xs text-muted-foreground leading-none">
              {t("tagline")}
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth">{t("signIn")}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth?mode=signup">{t("createAccount")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
