"use client";

import { AdminDemoSync } from "@/components/admin/AdminDemoSync";

export default function AdminDemoSyncPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Demo Sync</h1>
        <p className="text-muted-foreground">
          Run demo tender matching with configurable AI models.
        </p>
      </div>
      <AdminDemoSync />
    </div>
  );
}
