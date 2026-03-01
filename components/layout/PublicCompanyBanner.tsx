"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PublicCompanyBanner() {
  return (
    <header className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 gradient-hero rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-primary">TNDRX</h1>
              <p className="text-xs text-muted-foreground leading-none">
                Find tenders, form teams, win work.
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth">Sign In</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth?mode=signup">Create Free Account</Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
