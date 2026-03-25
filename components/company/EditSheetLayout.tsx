"use client";

import { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Info, Lock, Loader2 } from "lucide-react";

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
  children,
}: EditSheetLayoutProps) {
  const requiresReview = isReviewable && isVerified;
  const defaultSaveLabel = requiresReview ? "Save as Draft" : "Save";
  const finalSaveLabel = saveLabel ?? defaultSaveLabel;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-lg lg:max-w-[80vw] w-full flex flex-col p-0 gap-0"
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
                Editing is locked while your changes are under review.
              </p>
            </div>
          )}
          {!isEditLocked && requiresReview && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200 mt-3">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-900">
                This change will be saved as a draft and requires admin review before going live.
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
              Cancel
            </Button>
            <Button onClick={onSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isSaving ? "Saving..." : finalSaveLabel}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
