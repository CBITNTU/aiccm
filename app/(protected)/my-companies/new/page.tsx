"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MyCompaniesNewRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/my-company/new");
  }, [router]);
  return null;
}
