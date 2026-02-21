"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useSendInvitations } from "@/hooks/useProjectMutations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Mail,
  Send,
  Loader2,
  Users,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import type { TeamMember } from "@/hooks/useProjectDetails";

interface InvitationsPanelProps {
  projectId: string;
  projectName: string;
  teamMembers: TeamMember[];
  tenderTitle?: string;
}

type InvitationStatus = "pending" | "sent" | "accepted" | "rejected";

function getInvitationStatusBadge(member: TeamMember) {
  const status = member.invitation_status as
    | InvitationStatus
    | null
    | undefined;

  switch (status) {
    case "sent":
      return (
        <Badge
          variant="outline"
          className="bg-yellow-500/10 text-yellow-600 border-yellow-200"
        >
          Sent
        </Badge>
      );
    case "accepted":
      return (
        <Badge
          variant="outline"
          className="bg-green-500/10 text-green-600 border-green-200"
        >
          Accepted
        </Badge>
      );
    case "rejected": {
      const message = member.invitation_message;
      return (
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-red-500/10 text-red-600 border-red-200"
          >
            Declined
          </Badge>
          {message && (
            <span className="text-xs text-muted-foreground italic truncate max-w-[200px]">
              &ldquo;{message}&rdquo;
            </span>
          )}
        </div>
      );
    }
    case "pending":
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Not sent
        </Badge>
      );
  }
}

export function InvitationsPanel({
  projectId,
  projectName,
  teamMembers,
  tenderTitle,
}: InvitationsPanelProps) {
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [unregisteredWarning, setUnregisteredWarning] = useState<string[]>([]);
  const sendInvitations = useSendInvitations();

  // Filter to only show invitable members (not lead)
  const invitableMembers = teamMembers.filter(
    (m) => m.role === "invited" || m.role === "member",
  );

  // Members that can receive invitations (pending or sent for resend)
  const sendableMembers = invitableMembers.filter((m) => {
    const status = m.invitation_status;
    return !status || status === "pending" || status === "sent";
  });

  const togglePartner = (partnerId: string) => {
    setSelectedPartners((prev) =>
      prev.includes(partnerId)
        ? prev.filter((id) => id !== partnerId)
        : [...prev, partnerId],
    );
  };

  const handleSendInvitations = async () => {
    if (selectedPartners.length === 0) {
      toast.error("Select partners to send invitations");
      return;
    }

    try {
      const result = await sendInvitations.mutateAsync({
        projectId,
        tenderTitle: tenderTitle || projectName,
        partnerIds: selectedPartners,
      });

      if (result.invitationsSent > 0) {
        toast.success(
          `${result.invitationsSent} invitation${result.invitationsSent !== 1 ? "s" : ""} sent successfully`,
        );
      }

      if (
        result.unregisteredCompanies &&
        result.unregisteredCompanies.length > 0
      ) {
        setUnregisteredWarning(result.unregisteredCompanies);
      }

      setSelectedPartners([]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send invitations",
      );
    }
  };

  const selectAll = () => {
    setSelectedPartners(sendableMembers.map((m) => m.company_id));
  };

  const deselectAll = () => {
    setSelectedPartners([]);
  };

  // No partners to invite
  if (invitableMembers.length === 0) {
    return (
      <div className="py-6 text-center">
        <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">
          No partners to invite yet. Add partners to your team first.
        </p>
      </div>
    );
  }

  return (
    <div className="py-4 space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={selectAll}>
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={deselectAll}>
            Clear
          </Button>
        </div>
        <Button
          onClick={handleSendInvitations}
          disabled={selectedPartners.length === 0 || sendInvitations.isPending}
        >
          {sendInvitations.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Send{" "}
              {selectedPartners.length > 0 && `(${selectedPartners.length})`}
            </>
          )}
        </Button>
      </div>

      {/* Partner list */}
      <div className="space-y-2">
        {invitableMembers.map((member, index) => {
          const status = member.invitation_status;
          const isSendable =
            !status || status === "pending" || status === "sent";

          return (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`
                flex items-center justify-between p-3 border rounded-lg
                transition-colors
                ${
                  isSendable
                    ? `cursor-pointer ${
                        selectedPartners.includes(member.company_id)
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/50"
                      }`
                    : "opacity-75"
                }
              `}
              onClick={() => isSendable && togglePartner(member.company_id)}
            >
              <div className="flex items-center gap-3">
                {isSendable && (
                  <Checkbox
                    checked={selectedPartners.includes(member.company_id)}
                    onCheckedChange={() => togglePartner(member.company_id)}
                  />
                )}
                <div>
                  <div className="font-medium">
                    {member.companies?.company_name || "Unknown Company"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {member.companies?.contact_email || "No email available"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status === "sent" && isSendable && (
                  <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                {getInvitationStatusBadge(member)}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Unregistered companies warning */}
      {unregisteredWarning.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 p-3 bg-amber-100 text-amber-800 border border-amber-200 rounded-lg"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">
              Could not send emails to the following companies:
            </p>
            <ul className="mt-1 list-disc list-inside">
              {unregisteredWarning.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              These companies are not yet registered on the platform. They will
              need to sign up before they can receive invitations.
            </p>
          </div>
        </motion.div>
      )}

      {/* Invitation Preview */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-4 bg-muted/50 rounded-lg mt-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-medium">Invitation Preview</h4>
        </div>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Subject:</strong> Invitation to collaborate on{" "}
            {tenderTitle || projectName}
          </p>
          <p>
            <strong>Message:</strong> You&apos;ve been invited to join a
            consulting team for the project &quot;{projectName}&quot;
            {tenderTitle && ` targeting the tender "${tenderTitle}"`}. Please
            review the project details and accept the invitation to collaborate.
          </p>
        </div>
      </motion.div>

      {/* Success state */}
      {sendInvitations.isSuccess && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 p-3 bg-green-500/10 text-green-600 rounded-lg"
        >
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">Invitations sent successfully!</span>
        </motion.div>
      )}
    </div>
  );
}
