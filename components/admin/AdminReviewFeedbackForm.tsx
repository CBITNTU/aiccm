"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ReviewFeedback, ReviewFeedbackItem } from "@/lib/api/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";

const FEEDBACK_SECTION_KEYS = [
  "companyInfo",
  "contact",
  "website",
  "competencies",
  "certifications",
  "description",
  "financial",
  "compliance",
] as const;

type SectionKey = (typeof FEEDBACK_SECTION_KEYS)[number];

interface AdminReviewFeedbackFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (feedback: ReviewFeedback) => void;
  isPending: boolean;
  companyName: string;
}

export function AdminReviewFeedbackForm({
  open,
  onClose,
  onSubmit,
  isPending,
  companyName,
}: AdminReviewFeedbackFormProps) {
  const t = useTranslations("AdminReviewFeedback");
  const [sectionStates, setSectionStates] = useState<
    Record<string, { status: "ok" | "needs_changes"; notes: string }>
  >(() =>
    Object.fromEntries(
      FEEDBACK_SECTION_KEYS.map((s) => [s, { status: "ok" as const, notes: "" }]),
    ),
  );
  const [overallNotes, setOverallNotes] = useState("");

  // NOTE: State is reset on each open because the parent renders this component with
  // key={open ? "open" : "closed"}, causing a fresh remount whenever the dialog opens.

  const toggleSection = (section: string) => {
    setSectionStates((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        status: prev[section].status === "ok" ? "needs_changes" : "ok",
        notes: prev[section].status === "ok" ? prev[section].notes : "",
      },
    }));
  };

  const updateNotes = (section: string, notes: string) => {
    setSectionStates((prev) => ({
      ...prev,
      [section]: { ...prev[section], notes },
    }));
  };

  const flaggedCount = Object.values(sectionStates).filter(
    (s) => s.status === "needs_changes",
  ).length;

  const canSubmit =
    flaggedCount > 0 ||
    overallNotes.trim().length > 0;

  const handleSubmit = () => {
    const items: ReviewFeedbackItem[] = FEEDBACK_SECTION_KEYS.map((s) => ({
      section: s,
      label: t(`sections.${s}` as const),
      status: sectionStates[s].status,
      notes: sectionStates[s].notes.trim(),
    }));

    onSubmit({
      items,
      overallNotes: overallNotes.trim(),
    });
  };

  const handleClose = () => {
    setSectionStates(
      Object.fromEntries(
        FEEDBACK_SECTION_KEYS.map((s) => [s, { status: "ok" as const, notes: "" }]),
      ),
    );
    setOverallNotes("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle", { name: companyName })}</DialogTitle>
          <DialogDescription>
            {t("dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {FEEDBACK_SECTION_KEYS.map((s) => {
            const state = sectionStates[s];
            const isFlagged = state.status === "needs_changes";
            const label = t(`sections.${s}` as const);

            return (
              <div
                key={s}
                className={`border rounded-lg p-3 transition-colors ${
                  isFlagged ? "border-amber-300 bg-amber-50/50" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{label}</span>
                  <Button
                    variant={isFlagged ? "outline" : "ghost"}
                    size="sm"
                    onClick={() => toggleSection(s)}
                    className={`gap-1.5 h-7 text-xs ${
                      isFlagged
                        ? "border-amber-300 text-amber-700 hover:bg-amber-100"
                        : "text-muted-foreground"
                    }`}
                  >
                    {isFlagged ? (
                      <>
                        <AlertTriangle className="h-3 w-3" />
                        {t("needsChanges")}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3 w-3" />
                        {t("ok")}
                      </>
                    )}
                  </Button>
                </div>
                {isFlagged && (
                  <Textarea
                    placeholder={t("sectionPlaceholder", { label: label.toLowerCase() })}
                    value={state.notes}
                    onChange={(e) => updateNotes(s, e.target.value)}
                    rows={2}
                    className="mt-2 text-sm"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div>
          <label className="text-sm font-medium">{t("overallLabel")}</label>
          <Textarea
            placeholder={t("overallPlaceholder")}
            value={overallNotes}
            onChange={(e) => setOverallNotes(e.target.value)}
            rows={3}
            className="mt-1"
          />
        </div>

        {flaggedCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            {t("flaggedCount", { count: flaggedCount })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="gap-1"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
