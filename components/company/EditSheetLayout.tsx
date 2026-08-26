"use client";

import { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Info, Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditSheetLayoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Whether the fields in this sheet require admin review for verified companies */
  isReviewable: boolean;
  /** Whether the company is verified */
  isVerified: boolean;
  /** Whether editing is locked due to pending review */
  isEditLocked: boolean;
  isSaving: boolean;
  onSave: () => void;
  /** Override the save button text. Defaults to "Save" or "Save as Draft" based on review context. */
  saveLabel?: string;
  /** "default" for single-column forms; "wide" for the two-pane selector sheets. */
  size?: "default" | "wide";
  children: ReactNode;
}

export function EditSheetLayout({
  open,
  onOpenChange,
  title,
  description,
  isReviewable,
  isVerified,
  isEditLocked,
  isSaving,
  onSave,
  saveLabel,
  size = "default",
  children,
}: EditSheetLayoutProps) {
  const t = useTranslations("EditSheetLayout");
  const requiresReview = isReviewable && isVerified;
  const defaultSaveLabel = requiresReview ? t("saveAsDraft") : t("save");
  const finalSaveLabel = saveLabel ?? defaultSaveLabel;
  const sheetWidth =
    size === "wide" ? "sm:max-w-lg lg:max-w-4xl xl:max-w-5xl" : "sm:max-w-xl";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("w-full flex flex-col p-0 gap-0", sheetWidth)}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b space-y-1.5">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>

          {/* Review status banners */}
          {isEditLocked && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200 mt-3">
              <Lock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-900">
                {t("editingLocked")}
              </p>
            </div>
          )}
          {!isEditLocked && requiresReview && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200 mt-3">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-900">
                {t("requiresReview")}
              </p>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="h-full">{children}</div>
        </div>

        {/* Sticky footer */}
        {!isEditLocked && (
          <div className="px-6 py-4 border-t bg-background flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              {t("cancel")}
            </Button>
            <Button onClick={onSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isSaving ? t("saving") : finalSaveLabel}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
