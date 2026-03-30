"use client";

import AdminOnboarding from "@/components/admin/AdminOnboarding";

export default function AdminOnboardingPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Onboarding</h1>
        <p className="text-muted-foreground">
          Track user onboarding progress and completion rates.
        </p>
      </div>
      <AdminOnboarding />
    </div>
  );
}
