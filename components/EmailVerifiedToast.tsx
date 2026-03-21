"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";

export function EmailVerifiedToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const emailVerified = searchParams.get("email_verified");

  useEffect(() => {
    if (emailVerified === "true") {
      toast.success("Email verified!", {
        description: "You can now continue with your profile setup.",
        duration: 5000,
      });

      // Remove the query parameter from URL without refreshing
      const params = new URLSearchParams(searchParams.toString());
      params.delete("email_verified");
      const newUrl = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [emailVerified, router, pathname, searchParams]);

  return null;
}
