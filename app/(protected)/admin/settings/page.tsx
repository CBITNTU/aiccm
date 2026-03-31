"use client";

import { AdminAISettings } from "@/components/admin/AdminAISettings";
import { AdminVerificationSettings } from "@/components/admin/AdminVerificationSettings";

export default function AdminSettingsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Configure AI models, verification rules, and platform settings.
        </p>
      </div>
      <div className="space-y-6">
        <AdminAISettings />
        <AdminVerificationSettings />
      </div>
    </div>
  );
}
