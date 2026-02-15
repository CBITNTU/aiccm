"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { BarChart3 } from "lucide-react";

interface MatchScoreDistributionProps {
  matches: { overall_score: number }[];
}

const BUCKETS = [
  { label: "Low (<40)", min: 0, max: 39, color: "hsl(var(--muted-foreground))" },
  { label: "Fair (40-59)", min: 40, max: 59, color: "hsl(45, 93%, 47%)" },
  { label: "Good (60-79)", min: 60, max: 79, color: "hsl(25, 95%, 53%)" },
  { label: "Excellent (80+)", min: 80, max: 100, color: "hsl(142, 76%, 36%)" },
];

export function MatchScoreDistribution({ matches }: MatchScoreDistributionProps) {
  const data = useMemo(() => {
    return BUCKETS.map((bucket) => ({
      name: bucket.label,
      count: matches.filter(
        (m) => m.overall_score >= bucket.min && m.overall_score <= bucket.max
      ).length,
      color: bucket.color,
    }));
  }, [matches]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Score Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Run matching to see score distribution
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                  fontSize: "12px",
                }}
                formatter={(value) => [`${value} matches`, "Count"]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
