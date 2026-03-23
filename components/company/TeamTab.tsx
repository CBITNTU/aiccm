"use client";

import { useState } from "react";
import { TeamMembersCard } from "@/components/company/TeamMembersCard";
import { PendingInvitationsCard } from "@/components/company/PendingInvitationsCard";

interface TeamTabProps {
  companyId: string;
  companyName: string;
  isOwner: boolean;
  currentUserId: string | undefined;
}

export function TeamTab({
  companyId,
  companyName,
  isOwner,
  currentUserId,
}: TeamTabProps) {
  const [inviteRefreshTrigger, setInviteRefreshTrigger] = useState(0);

  return (
    <div className="space-y-6">
      <TeamMembersCard
        companyId={companyId}
        companyName={companyName}
        variant="full"
        isSmeOwner={isOwner}
        currentUserId={currentUserId}
        onInviteSent={() => setInviteRefreshTrigger((n) => n + 1)}
      />
      {isOwner && (
        <PendingInvitationsCard
          companyId={companyId}
          refreshTrigger={inviteRefreshTrigger}
        />
      )}
    </div>
  );
}
