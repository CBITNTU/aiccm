"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock } from "lucide-react";

interface MatchWithDeadline {
  id: string;
  tenders: {
    title: string;
    deadline: string;
  };
}

interface UpcomingDeadlinesCardProps {
  matches: MatchWithDeadline[];
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyColor(days: number) {
  if (days < 7) return "bg-red-600 hover:bg-red-700 text-white";
  if (days < 14) return "bg-amber-600 hover:bg-amber-700 text-white";
  return "bg-green-600 hover:bg-green-700 text-white";
}

export function UpcomingDeadlinesCard({ matches }: UpcomingDeadlinesCardProps) {
  const upcoming = matches
    .filter((m) => m.tenders?.deadline && daysUntil(m.tenders.deadline) >= 0)
    .sort(
      (a, b) =>
        new Date(a.tenders.deadline).getTime() -
        new Date(b.tenders.deadline).getTime()
    )
    .slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Upcoming Deadlines
        </CardTitle>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No upcoming deadlines
          </p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((match) => {
              const days = daysUntil(match.tenders.deadline);
              return (
                <div
                  key={match.id}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <Badge className={urgencyColor(days)}>
                    {days === 0 ? "Today" : days === 1 ? "1 day" : `${days}d`}
                  </Badge>
                  <span className="text-sm truncate flex-1">
                    {match.tenders.title}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
