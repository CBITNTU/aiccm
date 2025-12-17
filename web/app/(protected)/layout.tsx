"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Building2, LayoutDashboard, User, FileText, Users, Settings, LogOut } from "lucide-react";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useAuth();
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
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-6">
              <Link href="/dashboard" className="flex items-center gap-2">
                <div className="w-8 h-8 btn-hero rounded flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-lg">AICCM</span>
              </Link>
              <nav className="hidden md:flex items-center gap-4">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
                <Link
                  href="/tenders"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Tenders
                </Link>
                <Link
                  href="/directory"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Companies
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/profile"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <User className="w-4 h-4" />
                Profile
              </Link>
              <button
                onClick={signOut}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>{children}</main>
    </div>
  );
}
