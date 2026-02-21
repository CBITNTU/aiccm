"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Mail, Phone, MapPin } from "lucide-react";
import type { TeamMember } from "@/hooks/useProjectDetails";

interface TeamContactsCardProps {
  teamMembers: TeamMember[];
}

export function TeamContactsCard({ teamMembers }: TeamContactsCardProps) {
  const membersWithContact = teamMembers.filter(
    (m) => m.companies?.contact_email || m.companies?.location,
  );

  if (membersWithContact.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Team Contact Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {membersWithContact.map((member) => (
            <div
              key={member.id}
              className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
            >
              <div className="flex-1 space-y-1">
                <p className="font-medium">
                  {member.companies?.company_name || "Unknown Company"}
                </p>
                {member.companies?.contact_email && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <a
                      href={`mailto:${member.companies.contact_email}`}
                      className="hover:underline"
                    >
                      {member.companies.contact_email}
                    </a>
                  </p>
                )}
                {member.companies?.contact_phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {member.companies.contact_phone}
                  </p>
                )}
                {member.companies?.location && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {member.companies.location}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
