export type VerificationDisplayState =
  | "verified"
  | "pending"
  | "changes_requested"
  | "rejected"
  | "unverified";

/**
 * Derives the display state for verification status indicators.
 * Actionable request statuses take priority, but changes_requested/rejected
 * only apply when pending changes still exist (otherwise they're stale).
 */
export function deriveVerificationDisplayState(
  verificationStatus: string | null | undefined,
  latestRequestStatus: string | null | undefined,
  hasPendingChanges: boolean,
): VerificationDisplayState {
  // Pending review always takes priority
  if (latestRequestStatus === "pending") return "pending";
  // Changes requested / rejected only matter if pending changes still exist
  if (hasPendingChanges && latestRequestStatus === "changes_requested") return "changes_requested";
  if (hasPendingChanges && latestRequestStatus === "rejected") return "rejected";
  if (verificationStatus === "verified") return "verified";
  return "unverified";
}

export const verificationStateConfig = {
  verified: {
    label: "Verified",
    dotColor: "bg-emerald-500",
    pulse: false,
  },
  pending: {
    label: "Under Review",
    dotColor: "bg-amber-500",
    pulse: false,
  },
  changes_requested: {
    label: "Changes Requested",
    dotColor: "bg-amber-500",
    pulse: true,
  },
  rejected: {
    label: "Rejected",
    dotColor: "bg-red-500",
    pulse: true,
  },
  unverified: {
    label: "Not verified",
    dotColor: "bg-gray-400",
    pulse: false,
  },
} as const;
