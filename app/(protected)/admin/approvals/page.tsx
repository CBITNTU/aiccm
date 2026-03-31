"use client";

import AdminApprovals from "@/components/admin/AdminApprovals";

export default function AdminApprovalsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Approvals</h1>
        <p className="text-muted-foreground">
          Review and approve pending user and company join requests.
        </p>
      </div>
      <AdminApprovals />
    </div>
  );
}
