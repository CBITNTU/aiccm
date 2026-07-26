"use client";

import { useTranslations } from "next-intl";
import { Target, EyeOff } from "lucide-react";
import type { MatchesView } from "./TenderMatching";

interface MatchesViewSwitchProps {
  value: MatchesView;
  onChange: (view: MatchesView) => void;
  /** Badge on the "Ruled out" segment. Hidden when 0. */
  ruledOutCount: number;
}

/**
 * Scope selector for the Matches tab: scored matches vs. the deep analyses that
 * came back at 0%. Sits above the search bar because it decides *what* is being
 * searched, not how it's filtered.
 *
 * Styled to mirror the page's TabsList so it reads as a nested level of the same
 * control family — there is no ToggleGroup primitive in components/ui.
 */
export function MatchesViewSwitch({
  value,
  onChange,
  ruledOutCount,
}: MatchesViewSwitchProps) {
  const t = useTranslations("TenderMatching");

  const segments: Array<{
    view: MatchesView;
    label: string;
    icon: typeof Target;
    count?: number;
  }> = [
    { view: "matched", label: t("viewMatches"), icon: Target },
    {
      view: "ruledOut",
      label: t("viewRuledOut"),
      icon: EyeOff,
      count: ruledOutCount,
    },
  ];

  return (
    <div
      role="tablist"
      aria-label={t("viewSwitchLabel")}
      className="inline-flex h-9 items-center rounded-lg bg-muted p-1"
    >
      {segments.map(({ view, label, icon: Icon, count }) => {
        const isActive = value === view;
        return (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(view)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-all cursor-pointer ${
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {count != null && count > 0 && (
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[11px] leading-none tabular-nums ${
                  isActive
                    ? "bg-muted text-muted-foreground"
                    : "bg-background/70 text-muted-foreground"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
