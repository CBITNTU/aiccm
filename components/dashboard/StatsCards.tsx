"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, Target, Bookmark, FolderKanban } from "lucide-react";

interface StatsCardsProps {
  totalTenders: number;
  matchingResults: number;
  savedCount: number;
  projects: number;
}

export function StatsCards({
  totalTenders,
  matchingResults,
  savedCount,
  projects,
}: StatsCardsProps) {
  const router = useRouter();

  const cards = [
    {
      title: "Active Tenders",
      value: totalTenders,
      subtitle: "Available opportunities",
      icon: FileText,
      href: "/tenders",
    },
    {
      title: "Matched Opportunities",
      value: matchingResults,
      subtitle: "AI-matched tenders",
      icon: Target,
      href: "/tenders?tab=matches",
    },
    {
      title: "Saved Tenders",
      value: savedCount,
      subtitle: "Bookmarked opportunities",
      icon: Bookmark,
      href: "/tenders?tab=saved",
    },
    {
      title: "Active Projects",
      value: projects,
      subtitle: "Consulting projects",
      icon: FolderKanban,
      href: "/projects",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {cards.map((card) => (
        <Card
          key={card.title}
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push(card.href)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground">{card.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
