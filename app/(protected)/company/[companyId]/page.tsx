"use client";

import { useParams } from "next/navigation";
import { CompanyDetailPage } from "@/components/company/CompanyDetailPage";

export default function CompanyDetailRoute() {
  const params = useParams();
  const companyId = params.companyId as string;

  return <CompanyDetailPage companyId={companyId} basePath={`/company/${companyId}`} />;
}
