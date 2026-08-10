"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Sidenav } from "@/components/layout/Sidenav";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { EmailVerifiedToast } from "@/components/EmailVerifiedToast";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { OrgProvider } from "@/hooks/useOrg";

function ProtectedLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const hasRedirectedRef = useRef(false);
  const search = searchParams.toString();
  const currentUrl = useMemo(
    () => pathname + (search ? `?${search}` : ""),
    [pathname, search],
  );

  useEffect(() => {
    if (loading) {
      hasRedirectedRef.current = false;
      return;
    }

    if (!user && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      const encodedRedirectTo = encodeURIComponent(currentUrl);
      router.replace(`/auth?redirectTo=${encodedRedirectTo}`);
    }
  }, [user, loading, router, currentUrl]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <OrgProvider>
      <div className="min-h-screen bg-background">
        <ImpersonationBanner />

        <Suspense fallback={null}>
          <EmailVerifiedToast />
        </Suspense>

        {/* Mobile Header */}
        <div className="md:hidden">
          <Header
            variant="app"
            onMobileMenuToggle={() => setMobileMenuOpen(true)}
          />
        </div>

        {/* Main Layout */}
        <div className="flex min-h-screen">
          {/* Sidenav - handles both desktop and mobile */}
          <Sidenav
            mobileOpen={mobileMenuOpen}
            onMobileOpenChange={setMobileMenuOpen}
          />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-h-screen min-w-0 overflow-x-hidden">
            <EmailVerificationBanner />
            <main className="flex-1">{children}</main>
          </div>
        </div>
      </div>
    </OrgProvider>
  );
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      }
    >
      <ProtectedLayoutContent>{children}</ProtectedLayoutContent>
    </Suspense>
  );
}
