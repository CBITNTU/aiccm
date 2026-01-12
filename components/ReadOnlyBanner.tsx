"use client";

import { useAuth } from "@/hooks/useAuth";
import { Eye, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ReadOnlyBanner() {
  const { isPendingApproval } = useAuth();

  if (!isPendingApproval) return null;

  return (
    <div className="bg-gradient-to-r from-amber-400 to-yellow-500 text-white px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Your account is pending approval. You can browse content but some
            actions are restricted.
          </span>
        </div>
        <Button
          asChild
          size="sm"
          className="bg-white text-amber-700 hover:bg-amber-50 font-semibold"
        >
          <Link href="/pending-approval" className="flex items-center gap-1">
            Check status
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
