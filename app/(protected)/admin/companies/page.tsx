"use client";

import { AdminCompanyManager } from "@/components/admin/AdminCompanyManager";

export default function AdminCompaniesPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Companies</h1>
        <p className="text-muted-foreground">
          Manage platform companies, verification status, and data imports.
        </p>
      </div>
      <AdminCompanyManager />
    </div>
  );
}
