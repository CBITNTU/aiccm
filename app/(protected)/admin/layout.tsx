"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUserRole } from "@/hooks/useUserRole";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAdmin, loading } = useUserRole();
  const router = useRouter();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (!loading && !isAdmin && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      toast.error("Superadmin access required");
      router.replace("/dashboard");
    }
  }, [isAdmin, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">
                Loading superadmin access...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return <>{children}</>;
}
