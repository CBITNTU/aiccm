"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

interface TeamMember {
  id: string;
  companyId: string;
  role: string;
  companies?: {
    companyName: string;
    contactEmail?: string | null;
  } | null;
}

interface InvitationManagerProps {
  members: TeamMember[];
  onSendInvitations: (partnerIds: string[]) => void;
  projectTitle?: string;
}

export function InvitationManager({
  members,
  onSendInvitations,
  projectTitle,
}: InvitationManagerProps) {
  const t = useTranslations("InvitationManager");
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);

  // Filter out lead and already accepted members
  const invitableMembers = members.filter(
    (m) => m.role === "invited" || m.role === "member",
  );

  const togglePartner = (partnerId: string) => {
    setSelectedPartners((prev) =>
      prev.includes(partnerId)
        ? prev.filter((id) => id !== partnerId)
        : [...prev, partnerId],
    );
  };

  const handleSendInvitations = () => {
    if (selectedPartners.length === 0) return;
    onSendInvitations(selectedPartners);
    setSelectedPartners([]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {t("title")}
            </CardTitle>
            <CardDescription className="mt-1">
              {t("description")}
            </CardDescription>
          </div>
          <Button
            onClick={handleSendInvitations}
            disabled={selectedPartners.length === 0}
          >
            <Send className="h-4 w-4 mr-2" />
            {t("sendButton", { count: selectedPartners.length })}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {invitableMembers.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {t("noPartners")}
          </p>
        ) : (
          <div className="space-y-3">
            {invitableMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedPartners.includes(member.companyId)}
                    onCheckedChange={() => togglePartner(member.companyId)}
                  />
                  <div>
                    <div className="font-medium">
                      {member.companies?.companyName}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {member.companies?.contactEmail || t("noEmail")}
                    </div>
                  </div>
                </div>
                <Badge
                  variant={member.role === "invited" ? "secondary" : "default"}
                >
                  {member.role === "invited" ? t("statusPending") : t("statusAccepted")}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {invitableMembers.length > 0 && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">{t("previewTitle")}</h4>
            <div className="text-sm text-muted-foreground">
              <p>{t("previewSubject", { projectTitle: projectTitle || "Unknown Project" })}</p>
              <p className="mt-2">{t("previewMessage", { projectTitle: projectTitle || "Unknown Project" })}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
