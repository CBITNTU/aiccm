"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2,
  Mail,
  Phone,
  Target,
  Calendar,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { useRespondToInvitation } from "@/hooks/useProjectInvitations";
import type { ProjectInvitation } from "@/hooks/useProjectInvitations";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface ProjectInvitationCardProps {
  invitation: ProjectInvitation;
  onResponded?: (action: "accept" | "reject", projectId: string) => void;
}

export function ProjectInvitationCard({
  invitation,
  onResponded,
}: ProjectInvitationCardProps) {
  const t = useTranslations("ProjectInvitationCard");
  const [showRejectMessage, setShowRejectMessage] = useState(false);
  const [message, setMessage] = useState("");
  const respond = useRespondToInvitation();

  const handleAccept = async () => {
    try {
      const result = await respond.mutateAsync({
        invitationId: invitation.id,
        action: "accept",
      });
      toast.success(t("acceptSuccess"));
      onResponded?.("accept", result.projectId);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("acceptError"),
      );
    }
  };

  const handleReject = async () => {
    try {
      await respond.mutateAsync({
        invitationId: invitation.id,
        action: "reject",
        message: message || undefined,
      });
      toast.success(t("declineSuccess"));
      onResponded?.("reject", invitation.voId);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("declineError"),
      );
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{invitation.project.name}</CardTitle>
          <Badge variant="secondary">{t("statusPending")}</Badge>
        </div>
        {invitation.project.description && (
          <p className="text-sm text-muted-foreground mt-1">
            {invitation.project.description}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lead company info */}
        {invitation.leadCompany && (
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">{invitation.leadCompany.name}</p>
              {invitation.leadCompany.contactEmail && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {invitation.leadCompany.contactEmail}
                </p>
              )}
              {invitation.leadCompany.contactPhone && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {invitation.leadCompany.contactPhone}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Tender info */}
        {invitation.tender && (
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <Target className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">{invitation.tender.title}</p>
              {invitation.tender.buyer && (
                <p className="text-sm text-muted-foreground">
                  {t("buyer", { buyerName: invitation.tender.buyer })}
                </p>
              )}
              {invitation.tender.deadline && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {t("deadline", { date: new Date(invitation.tender.deadline).toLocaleDateString(
                    "en-GB",
                    { day: "numeric", month: "long", year: "numeric" },
                  ) })}
                </p>
              )}
              {invitation.tender.budgetMax && (
                <p className="text-sm text-muted-foreground">
                  {t("estValue", { amount: invitation.tender.budgetMax.toLocaleString() })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Reject message */}
        {showRejectMessage && (
          <div className="space-y-2">
            <Textarea
              placeholder={t("declinePlaceholder")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handleAccept}
            disabled={respond.isPending}
            className="flex-1"
          >
            {respond.isPending && respond.variables?.action === "accept" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            {t("acceptButton")}
          </Button>
          {!showRejectMessage ? (
            <Button
              variant="outline"
              onClick={() => setShowRejectMessage(true)}
              disabled={respond.isPending}
              className="flex-1"
            >
              <XCircle className="h-4 w-4 mr-2" />
              {t("declineButton")}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={respond.isPending}
              className="flex-1"
            >
              {respond.isPending && respond.variables?.action === "reject" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              {t("confirmDeclineButton")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
