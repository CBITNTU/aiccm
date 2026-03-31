"use client";

import AdminTaxonomyEditor from "@/components/admin/AdminTaxonomyEditor";

export default function AdminTaxonomyPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Taxonomy</h1>
        <p className="text-muted-foreground">
          Manage capability categories and hierarchical taxonomy structure.
        </p>
      </div>
      <AdminTaxonomyEditor />
    </div>
  );
}
