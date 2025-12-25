"use client";

import { Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { EmailVerifiedToast } from "@/components/EmailVerifiedToast";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
    }
  }, [user, loading, router]);

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
    <div className="min-h-screen bg-background">
      <Suspense fallback={null}>
        <EmailVerifiedToast />
      </Suspense>
      <Header variant="app" />
      <EmailVerificationBanner />
      <main>{children}</main>
    </div>
  );
}
