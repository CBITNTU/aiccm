"use client";

import { useState } from "react";
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

const FEEDBACK_SECTIONS = [
  { section: "companyInfo", label: "Company Information" },
  { section: "contact", label: "Contact Details" },
  { section: "website", label: "Website" },
  { section: "competencies", label: "Competencies & Capabilities" },
  { section: "certifications", label: "Certifications & Standards" },
  { section: "description", label: "Company Description" },
  { section: "financial", label: "Financial Data" },
  { section: "compliance", label: "Compliance" },
] as const;

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
  const [sectionStates, setSectionStates] = useState<
    Record<string, { status: "ok" | "needs_changes"; notes: string }>
  >(() =>
    Object.fromEntries(
      FEEDBACK_SECTIONS.map((s) => [s.section, { status: "ok" as const, notes: "" }]),
    ),
  );
  const [overallNotes, setOverallNotes] = useState("");

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
    const items: ReviewFeedbackItem[] = FEEDBACK_SECTIONS.map((s) => ({
      section: s.section,
      label: s.label,
      status: sectionStates[s.section].status,
      notes: sectionStates[s.section].notes.trim(),
    }));

    onSubmit({
      items,
      overallNotes: overallNotes.trim(),
    });
  };

  const handleClose = () => {
    // Reset form state
    setSectionStates(
      Object.fromEntries(
        FEEDBACK_SECTIONS.map((s) => [s.section, { status: "ok" as const, notes: "" }]),
      ),
    );
    setOverallNotes("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Changes — {companyName}</DialogTitle>
          <DialogDescription>
            Select sections that need attention and provide specific feedback for each.
            The company will see this feedback and can make changes before resubmitting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {FEEDBACK_SECTIONS.map((s) => {
            const state = sectionStates[s.section];
            const isFlagged = state.status === "needs_changes";

            return (
              <div
                key={s.section}
                className={`border rounded-lg p-3 transition-colors ${
                  isFlagged ? "border-amber-300 bg-amber-50/50" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{s.label}</span>
                  <Button
                    variant={isFlagged ? "outline" : "ghost"}
                    size="sm"
                    onClick={() => toggleSection(s.section)}
                    className={`gap-1.5 h-7 text-xs ${
                      isFlagged
                        ? "border-amber-300 text-amber-700 hover:bg-amber-100"
                        : "text-muted-foreground"
                    }`}
                  >
                    {isFlagged ? (
                      <>
                        <AlertTriangle className="h-3 w-3" />
                        Needs Changes
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3 w-3" />
                        OK
                      </>
                    )}
                  </Button>
                </div>
                {isFlagged && (
                  <Textarea
                    placeholder={`What needs to change in ${s.label.toLowerCase()}?`}
                    value={state.notes}
                    onChange={(e) => updateNotes(s.section, e.target.value)}
                    rows={2}
                    className="mt-2 text-sm"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div>
          <label className="text-sm font-medium">Overall Notes (optional)</label>
          <Textarea
            placeholder="Any additional context or instructions..."
            value={overallNotes}
            onChange={(e) => setOverallNotes(e.target.value)}
            rows={3}
            className="mt-1"
          />
        </div>

        {flaggedCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            {flaggedCount} section{flaggedCount !== 1 ? "s" : ""} flagged for changes
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="gap-1"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Send Feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
