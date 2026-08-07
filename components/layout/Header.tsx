"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Menu, LogOut } from "lucide-react";

interface HeaderProps {
  variant?: "landing" | "app";
  onMobileMenuToggle?: () => void;
}

export function Header({
  variant = "landing",
  onMobileMenuToggle,
}: HeaderProps) {
  const t = useTranslations("Header");
  const { user, loading, signOut, hasReadyUiInSession, isUiReadyHydrated } =
    useAuth();
  const canUseReadyBranch = isUiReadyHydrated && hasReadyUiInSession;
  const showInitialAuthSkeleton =
    variant === "landing" && loading && !canUseReadyBranch;

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <BrandLogo className="h-8" priority />
            <span className="hidden sm:block border-l border-border pl-3 text-xs text-muted-foreground leading-none">
              {t("tagline")}
            </span>
          </Link>

          {/* Actions */}
          <div className="flex items-center space-x-3">
            {variant === "landing" ? (
              <div className="flex space-x-4">
                {showInitialAuthSkeleton ? (
                  <div className="flex items-center space-x-4" aria-hidden="true">
                    <Skeleton className="h-9 w-28 rounded-md" />
                    <Skeleton className="h-9 w-32 rounded-md" />
                  </div>
                ) : loading && canUseReadyBranch ? (
                  <div
                    className="flex items-center space-x-4 opacity-0 pointer-events-none"
                    aria-hidden="true"
                  >
                    <Button variant="outline">Placeholder</Button>
                    <Button>Placeholder</Button>
                  </div>
                ) : user ? (
                  <div className="flex items-center space-x-4">
                    <Button variant="outline" asChild>
                      <Link href="/dashboard">{t("dashboard")}</Link>
                    </Button>
                    <Button
                      onClick={handleSignOut}
                      className="flex items-center"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      {t("signOut")}
                    </Button>
                  </div>
                ) : (
                  <div className="flex space-x-4">
                    <Button variant="outline" asChild>
                      <Link href="/auth">{t("signIn")}</Link>
                    </Button>
                    <Button asChild>
                      <Link href="/auth">{t("getStarted")}</Link>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              /* Mobile Menu Toggle - Only show for app variant on mobile */
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={onMobileMenuToggle}
                aria-label={t("menuToggle")}
              >
                <Menu className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
