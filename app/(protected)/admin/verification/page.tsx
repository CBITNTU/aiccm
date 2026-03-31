"use client";

import { AdminVerification } from "@/components/admin/AdminVerification";

export default function AdminVerificationPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Verification
        </h1>
        <p className="text-muted-foreground">
          Review company verification and competency change requests.
        </p>
      </div>
      <AdminVerification />
    </div>
  );
}
