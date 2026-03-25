"use client";

import { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Lock, type LucideIcon } from "lucide-react";

interface SectionCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  hasPendingChange?: boolean;
  isEditLocked?: boolean;
  onEdit?: () => void;
  editLabel?: string;
  /** Hide edit button entirely (e.g. non-owners) */
  hideEdit?: boolean;
  children: ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  hasPendingChange = false,
  isEditLocked = false,
  onEdit,
  editLabel = "Edit",
  hideEdit = false,
  children,
  className,
}: SectionCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            {title}
            {hasPendingChange && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200"
              >
                Draft
              </Badge>
            )}
            {isEditLocked && (
              <Lock className="h-3.5 w-3.5 text-amber-500" />
            )}
          </CardTitle>
          {description && (
            <CardDescription>{description}</CardDescription>
          )}
        </div>
        {onEdit && !hideEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            disabled={isEditLocked}
            className="shrink-0"
          >
            <Edit2 className="h-3.5 w-3.5 mr-1.5" />
            {editLabel}
          </Button>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
