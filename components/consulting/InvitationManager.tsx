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

interface TeamMember {
  id: string;
  company_id: string;
  role: string;
  companies?: {
    company_name: string;
    contact_email?: string | null;
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
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);

  // Filter out lead and already accepted members
  const invitableMembers = members.filter(
    (m) => m.role === "invited" || m.role === "member"
  );

  const togglePartner = (partnerId: string) => {
    setSelectedPartners((prev) =>
      prev.includes(partnerId)
        ? prev.filter((id) => id !== partnerId)
        : [...prev, partnerId]
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
              Invitations
            </CardTitle>
            <CardDescription className="mt-1">
              Send collaboration invitations to selected partners
            </CardDescription>
          </div>
          <Button
            onClick={handleSendInvitations}
            disabled={selectedPartners.length === 0}
          >
            <Send className="h-4 w-4 mr-2" />
            Send {selectedPartners.length > 0 && `(${selectedPartners.length})`}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {invitableMembers.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No partners to invite. Add partners to your team first.
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
                    checked={selectedPartners.includes(member.company_id)}
                    onCheckedChange={() => togglePartner(member.company_id)}
                  />
                  <div>
                    <div className="font-medium">
                      {member.companies?.company_name}
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
              </div>
            ))}
          </div>
        )}

        {invitableMembers.length > 0 && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Invitation Preview</h4>
            <div className="text-sm text-muted-foreground">
              <p>
                <strong>Subject:</strong> Invitation to collaborate on{" "}
                {projectTitle}
              </p>
              <p className="mt-2">
                <strong>Message:</strong> You&apos;ve been invited to join a
                consulting team for the tender &quot;{projectTitle}&quot;.
                Please review the project details and accept the invitation to
                collaborate.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
