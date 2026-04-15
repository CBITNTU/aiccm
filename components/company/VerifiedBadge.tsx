"use client";

import { ShieldCheck } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface VerifiedBadgeProps {
  /** Icon-only mode for tight spaces like table cells */
  compact?: boolean;
  className?: string;
}

export function VerifiedBadge({ compact = false, className }: VerifiedBadgeProps) {
  const t = useTranslations("CompanyPage");
  if (compact) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <ShieldCheck
              className={cn(
                "h-4 w-4 text-emerald-600 flex-shrink-0 cursor-help",
                className
              )}
            />
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-emerald-900 text-white border-emerald-800"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <ShieldCheck className="h-3 w-3" />
              {t("verifiedBadge.verifiedBy")}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
              "bg-emerald-100 text-emerald-800 border border-emerald-300",
              "shadow-sm cursor-help shrink-0",
              className
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("verifiedBadge.verified")}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-emerald-900 text-white border-emerald-800"
        >
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <ShieldCheck className="h-3 w-3" />
            {t("verifiedBadge.verifiedBy")}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
