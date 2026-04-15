"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
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

export function InvitationsPanel({
  projectId,
  projectName,
  teamMembers,
  tenderTitle,
}: InvitationsPanelProps) {
  const t = useTranslations("InvitationsPanel");
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [unregisteredWarning, setUnregisteredWarning] = useState<string[]>([]);
  const sendInvitations = useSendInvitations();

  const getInvitationStatusBadge = (member: TeamMember) => {
    const status = member.invitationStatus as InvitationStatus | null | undefined;
    switch (status) {
      case "sent":
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-200">
            {t("statusSent")}
          </Badge>
        );
      case "accepted":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
            {t("statusAccepted")}
          </Badge>
        );
      case "rejected": {
        const message = member.invitationMessage;
        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200">
              {t("statusDeclined")}
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
            {t("statusNotSent")}
          </Badge>
        );
    }
  };

  // Filter to only show invitable members (not lead)
  const invitableMembers = teamMembers.filter(
    (m) => m.role === "invited" || m.role === "member",
  );

  // Members that can receive invitations (pending or sent for resend)
  const sendableMembers = invitableMembers.filter((m) => {
    const status = m.invitationStatus;
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
      toast.error(t("selectFirst"));
      return;
    }

    try {
      const result = await sendInvitations.mutateAsync({
        projectId,
        tenderTitle: tenderTitle || projectName,
        partnerIds: selectedPartners,
      });

      if (result.invitationsSent > 0) {
        toast.success(t("sentCount", { n: result.invitationsSent }));
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
        err instanceof Error ? err.message : t("sendFailed"),
      );
    }
  };

  const selectAll = () => {
    setSelectedPartners(sendableMembers.map((m) => m.companyId));
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
          {t("noPartnersHint")}
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
            {t("selectAll")}
          </Button>
          <Button variant="ghost" size="sm" onClick={deselectAll}>
            {t("clear")}
          </Button>
        </div>
        <Button
          onClick={handleSendInvitations}
          disabled={selectedPartners.length === 0 || sendInvitations.isPending}
        >
          {sendInvitations.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("sending")}
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              {selectedPartners.length > 0
                ? t("sendWithCount", { n: selectedPartners.length })
                : t("send")}
            </>
          )}
        </Button>
      </div>

      {/* Partner list */}
      <div className="space-y-2">
        {invitableMembers.map((member, index) => {
          const status = member.invitationStatus;
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
                        selectedPartners.includes(member.companyId)
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/50"
                      }`
                    : "opacity-75"
                }
              `}
              onClick={() => isSendable && togglePartner(member.companyId)}
            >
              <div className="flex items-center gap-3">
                {isSendable && (
                  <Checkbox
                    checked={selectedPartners.includes(member.companyId)}
                    onCheckedChange={() => togglePartner(member.companyId)}
                  />
                )}
                <div>
                  <div className="font-medium">
                    {member.companies?.companyName || "Unknown Company"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {member.companies?.contactEmail || t("noEmail")}
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
              {t("unregisteredWarningTitle")}
            </p>
            <ul className="mt-1 list-disc list-inside">
              {unregisteredWarning.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              {t("unregisteredWarningDesc")}
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
          <h4 className="font-medium">{t("previewTitle")}</h4>
        </div>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>{t("subjectLabel")}</strong>{" "}
            {t("emailSubject", { name: tenderTitle || projectName })}
          </p>
          <p>
            <strong>{t("messageLabel")}</strong>{" "}
            {t("emailMessage", {
              projectName,
              tenderInfo: tenderTitle ? t("tenderInfoSuffix", { tenderTitle }) : "",
            })}
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
          <span className="text-sm">{t("sentSuccess")}</span>
        </motion.div>
      )}
    </div>
  );
}
