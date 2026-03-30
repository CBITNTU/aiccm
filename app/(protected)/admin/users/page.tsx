"use client";

import AdminUsers from "@/components/admin/AdminUsers";

export default function AdminUsersPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Users</h1>
        <p className="text-muted-foreground">
          Manage platform users, roles, and permissions.
        </p>
      </div>
      <AdminUsers />
    </div>
  );
}
