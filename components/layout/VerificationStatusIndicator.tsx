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
import { ShieldCheck, Clock, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerificationStatusIndicatorProps {
  isCollapsed: boolean;
  isMobile?: boolean;
}

type DisplayState = "verified" | "pending" | "changes_requested" | "rejected" | null;

function deriveDisplayState(
  verificationStatus: string | null | undefined,
  latestRequestStatus: string | null | undefined,
): DisplayState {
  if (verificationStatus === "verified") return "verified";
  if (verificationStatus === "pending_verification") return "pending";
  if (latestRequestStatus === "changes_requested") return "changes_requested";
  if (latestRequestStatus === "rejected") return "rejected";
  return null;
}

const stateConfig = {
  verified: {
    icon: ShieldCheck,
    label: "Verified",
    dotColor: "bg-emerald-500",
    textColor: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
  },
  pending: {
    icon: Clock,
    label: "Under Review",
    dotColor: "bg-amber-500",
    textColor: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  changes_requested: {
    icon: AlertTriangle,
    label: "Changes Requested",
    dotColor: "bg-amber-500",
    textColor: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  rejected: {
    icon: ShieldAlert,
    label: "Rejected",
    dotColor: "bg-red-500",
    textColor: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
} as const;

export function VerificationStatusIndicator({
  isCollapsed,
  isMobile = false,
}: VerificationStatusIndicatorProps) {
  const { selectedOrg } = useOrg();
  const { data, isLoading } = useVerificationStatus(selectedOrg?.id ?? null);
  const router = useRouter();

  if (!selectedOrg || isLoading || !data) return null;

  const displayState = deriveDisplayState(
    data.verificationStatus,
    data.latestRequest?.status,
  );

  if (!displayState) return null;

  const config = stateConfig[displayState];
  const Icon = config.icon;
  const showExpanded = !isCollapsed || isMobile;

  const handleClick = () => {
    router.push("/my-company");
  };

  if (!showExpanded) {
    return (
      <div className="px-2 py-1.5 border-b border-border flex justify-center">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleClick}
                className="w-2 h-2 rounded-full cursor-pointer"
                aria-label={`Verification: ${config.label}`}
              >
                <span className={cn("block w-2 h-2 rounded-full", config.dotColor)} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              Verification: {config.label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="px-3 py-1.5 border-b border-border">
      <button
        onClick={handleClick}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
          config.textColor,
          config.bgColor,
          "hover:opacity-80",
        )}
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">{config.label}</span>
      </button>
    </div>
  );
}
