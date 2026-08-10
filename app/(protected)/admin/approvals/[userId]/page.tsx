"use client";

import { use } from "react";
import { AdminUserPreparation } from "@/components/admin/AdminUserPreparation";

export default function AdminUserPreparationPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  return <AdminUserPreparation userId={userId} />;
}
