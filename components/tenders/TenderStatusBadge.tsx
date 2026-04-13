"use client";

import { Badge } from "@/components/ui/badge";
import { Clock, Lock, Award } from "lucide-react";
import { useTranslations } from "next-intl";

interface TenderStatusBadgeProps {
  status: string | null | undefined;
  size?: "sm" | "default";
}

export function TenderStatusBadge({
  status,
  size = "default",
}: TenderStatusBadgeProps) {
  const t = useTranslations("TenderStatusBadge");
  const textClass = size === "sm" ? "text-xs" : "text-sm";

  switch (status?.toLowerCase()) {
    case "open":
      return (
        <Badge variant="default" className={textClass}>
          {t("open")}
        </Badge>
      );
    case "closing_soon":
      return (
        <Badge variant="destructive" className={`${textClass} gap-1`}>
          <Clock className="h-3 w-3" />
          {t("closingSoon")}
        </Badge>
      );
    case "framework":
      return (
        <Badge variant="secondary" className={textClass}>
          {t("framework")}
        </Badge>
      );
    case "closed":
      return (
        <Badge
          variant="outline"
          className={`${textClass} gap-1 text-muted-foreground`}
        >
          <Lock className="h-3 w-3" />
          {t("closed")}
        </Badge>
      );
    case "awarded":
      return (
        <Badge
          className={`${textClass} gap-1 bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100`}
        >
          <Award className="h-3 w-3" />
          {t("awarded")}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={textClass}>
          {status ?? t("unknown")}
        </Badge>
      );
  }
}
