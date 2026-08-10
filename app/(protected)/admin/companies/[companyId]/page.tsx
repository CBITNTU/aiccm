"use client";

import { use } from "react";
import { AdminCompanyPreparation } from "@/components/admin/AdminCompanyPreparation";

export default function AdminCompanyPreparationPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);
  return <AdminCompanyPreparation companyId={companyId} />;
}
