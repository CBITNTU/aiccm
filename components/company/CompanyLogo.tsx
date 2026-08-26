"use client";

import Image from "next/image";
import { useState } from "react";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type CompanyLogoSize = "xs" | "sm" | "md" | "lg";

const SIZE_PX: Record<CompanyLogoSize, number> = {
  xs: 24,
  sm: 32,
  md: 56,
  lg: 80,
};

const ICON_CLASS: Record<CompanyLogoSize, string> = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-7 h-7",
  lg: "w-10 h-10",
};

const TEXT_CLASS: Record<CompanyLogoSize, string> = {
  xs: "text-[10px]",
  sm: "text-xs",
  md: "text-lg",
  lg: "text-2xl",
};

const RADIUS_CLASS: Record<CompanyLogoSize, string> = {
  xs: "rounded",
  sm: "rounded-md",
  md: "rounded-xl",
  lg: "rounded-xl",
};

interface CompanyLogoProps {
  companyName: string;
  logoUrl?: string | null;
  size?: CompanyLogoSize;
  /**
   * `icon` reproduces the gradient Building2 tile used on the company profile
   * hero; `initials` reproduces the muted initial used in the org switcher. The
   * fallback lives here rather than at each call site so a logo-less company
   * looks deliberate everywhere instead of broken in one place.
   */
  fallback?: "initials" | "icon";
  className?: string;
}

export function CompanyLogo({
  companyName,
  logoUrl,
  size = "md",
  fallback = "icon",
  className,
}: CompanyLogoProps) {
  const t = useTranslations("CompanyLogo");
  // Track *which* URL failed rather than a boolean. A replacement mints a new
  // URL (keys are content-hashed), so this self-resets without an effect —
  // otherwise one broken logo would poison every subsequent one.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = !!logoUrl && failedUrl === logoUrl;

  const px = SIZE_PX[size];
  const base = cn("shrink-0 overflow-hidden", RADIUS_CLASS[size], className);

  if (logoUrl && !failed) {
    return (
      <div
        className={cn(base, "bg-muted flex items-center justify-center")}
        style={{ width: px, height: px }}
      >
        <Image
          src={logoUrl}
          alt={t("alt", { companyName })}
          width={px}
          height={px}
          // contain, never cover: cropping a wordmark makes it unreadable.
          className="w-full h-full object-contain"
          onError={() => setFailedUrl(logoUrl)}
        />
      </div>
    );
  }

  if (fallback === "initials") {
    return (
      <div
        className={cn(
          base,
          "bg-primary/10 text-primary font-semibold flex items-center justify-center",
          TEXT_CLASS[size],
        )}
        style={{ width: px, height: px }}
        aria-hidden="true"
      >
        {companyName.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      className={cn(base, "gradient-hero flex items-center justify-center")}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      <Building2 className={cn(ICON_CLASS[size], "text-white")} />
    </div>
  );
}
