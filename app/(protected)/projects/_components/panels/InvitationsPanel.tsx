"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useSendInvitations } from "@/hooks/useProjectMutations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Send, Loader2, Users, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import type { TeamMember } from "@/hooks/useProjectDetails";

interface InvitationsPanelProps {
  projectId: string;
  projectName: string;
  teamMembers: TeamMember[];
  tenderTitle?: string;
}

export function InvitationsPanel({
  projectId,
  projectName,
  teamMembers,
  tenderTitle,
}: InvitationsPanelProps) {
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const sendInvitations = useSendInvitations();

  // Filter to only show invitable members (not lead, and either invited or member role)
  const invitableMembers = teamMembers.filter(
    (m) => m.role === "invited" || m.role === "member",
  );

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

      toast.success(`${result.invitationsSent} invitations sent successfully`);
      setSelectedPartners([]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send invitations",
      );
    }
  };

  const selectAll = () => {
    setSelectedPartners(invitableMembers.map((m) => m.company_id));
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
        {invitableMembers.map((member, index) => (
          <motion.div
            key={member.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`
              flex items-center justify-between p-3 border rounded-lg
              transition-colors cursor-pointer
              ${
                selectedPartners.includes(member.company_id)
                  ? "border-primary bg-primary/5"
                  : "hover:border-primary/50"
              }
            `}
            onClick={() => togglePartner(member.company_id)}
          >
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedPartners.includes(member.company_id)}
                onCheckedChange={() => togglePartner(member.company_id)}
              />
              <div>
                <div className="font-medium">
                  {member.companies?.company_name || "Unknown Company"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {member.companies?.contact_email || "No email available"}
                </div>
              </div>
            </div>
            <Badge
              variant={member.role === "invited" ? "secondary" : "default"}
            >
              {member.role === "invited" ? "Pending" : "Accepted"}
            </Badge>
          </motion.div>
        ))}
      </div>

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
