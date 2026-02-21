import { Badge } from "@/components/ui/badge";
import { Clock, Lock, Award } from "lucide-react";

interface TenderStatusBadgeProps {
  status: string | null | undefined;
  size?: "sm" | "default";
}

export function TenderStatusBadge({
  status,
  size = "default",
}: TenderStatusBadgeProps) {
  const textClass = size === "sm" ? "text-xs" : "text-sm";

  switch (status?.toLowerCase()) {
    case "open":
      return (
        <Badge variant="default" className={textClass}>
          Open
        </Badge>
      );
    case "closing_soon":
      return (
        <Badge variant="destructive" className={`${textClass} gap-1`}>
          <Clock className="h-3 w-3" />
          Closing Soon
        </Badge>
      );
    case "framework":
      return (
        <Badge variant="secondary" className={textClass}>
          Framework
        </Badge>
      );
    case "closed":
      return (
        <Badge
          variant="outline"
          className={`${textClass} gap-1 text-muted-foreground`}
        >
          <Lock className="h-3 w-3" />
          Closed
        </Badge>
      );
    case "awarded":
      return (
        <Badge
          className={`${textClass} gap-1 bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100`}
        >
          <Award className="h-3 w-3" />
          Awarded
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={textClass}>
          {status ?? "Unknown"}
        </Badge>
      );
  }
}
