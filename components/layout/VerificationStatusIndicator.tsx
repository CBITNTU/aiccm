"use client";

import { useRouter } from "next/navigation";
import { useOrg } from "@/hooks/useOrg";
import { useVerificationStatus } from "@/hooks/useVerificationStatus";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deriveVerificationDisplayState,
  verificationStateConfig,
} from "@/lib/verification-utils";

interface VerificationStatusIndicatorProps {
  isCollapsed: boolean;
  isMobile?: boolean;
}

export function VerificationStatusIndicator({
  isCollapsed,
  isMobile = false,
}: VerificationStatusIndicatorProps) {
  const { selectedOrg } = useOrg();
  const { data, isLoading } = useVerificationStatus(selectedOrg?.id ?? null);
  const router = useRouter();

  if (!selectedOrg || isLoading || !data) return null;

  const rawHasPendingChanges = !!data.hasPendingChanges;

  const displayState = deriveVerificationDisplayState(
    data.verificationStatus,
    data.latestRequest?.status,
    rawHasPendingChanges,
  );

  // Only show draft indicator if changes haven't already been submitted for review
  const hasPendingChanges = rawHasPendingChanges && data.latestRequest?.status !== "pending";
  const config = verificationStateConfig[displayState];
  const showExpanded = !isCollapsed || isMobile;

  const handleClick = () => {
    router.push(`/company/${selectedOrg.id}`);
  };

  // Build tooltip text
  const tooltipParts: string[] = [config.label];
  if (hasPendingChanges) tooltipParts.push("Draft changes");
  const tooltipText = tooltipParts.join(" · ");

  // Collapsed mode: single dot with combined tooltip
  if (!showExpanded) {
    return (
      <div className="border-b border-border px-2 py-1.5 flex flex-col items-center">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleClick}
                className="relative flex h-2.5 w-2.5 cursor-pointer"
                aria-label={tooltipText}
              >
                {config.pulse && (
                  <span
                    className={cn(
                      "absolute inline-flex h-full w-full rounded-full opacity-75 animate-pulse",
                      config.dotColor,
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative inline-flex rounded-full h-2.5 w-2.5",
                    config.dotColor,
                  )}
                />
                {hasPendingChanges && (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {tooltipText}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // Expanded mode: single muted row
  return (
    <div className="border-b border-border px-3 py-1.5">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleClick}
              className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
            >
              {/* Status dot */}
              <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                {config.pulse && (
                  <span
                    className={cn(
                      "absolute inline-flex h-full w-full rounded-full opacity-75 animate-pulse",
                      config.dotColor,
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative inline-flex rounded-full h-1.5 w-1.5",
                    config.dotColor,
                  )}
                />
              </span>

              {/* Label */}
              <span className="truncate">{config.label}</span>

              {/* Spacer */}
              <span className="flex-1" />

              {/* Draft changes icon */}
              {hasPendingChanges && (
                <FileEdit className="h-3 w-3 flex-shrink-0 text-amber-500 animate-pulse" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <div className="text-xs">
              <p>{config.label}</p>
              {hasPendingChanges && (
                <p className="text-amber-400">Draft changes pending</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
