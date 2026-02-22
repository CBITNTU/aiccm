"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MyCompaniesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/my-company");
  }, [router]);
  return null;
}
