"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Menu, LogOut } from "lucide-react";

interface HeaderProps {
  variant?: "landing" | "app";
  onMobileMenuToggle?: () => void;
}

export function Header({
  variant = "landing",
  onMobileMenuToggle,
}: HeaderProps) {
  const t = useTranslations("Header");
  const { user, loading, signOut } = useAuth();

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
            className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 gradient-hero rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-primary">{t("brand")}</h1>
              <p className="text-xs text-muted-foreground leading-none">
                {t("tagline")}
              </p>
            </div>
          </Link>

          {/* Actions */}
          <div className="flex items-center space-x-3">
            {variant === "landing" ? (
              <div className="flex space-x-4">
                {loading ? (
                  <div className="flex items-center space-x-4" aria-hidden="true">
                    <Skeleton className="h-9 w-28 rounded-md" />
                    <Skeleton className="h-9 w-32 rounded-md" />
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
