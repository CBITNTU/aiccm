"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Trash2, Globe } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { CompanyLogo } from "@/components/company/CompanyLogo";
import {
  useUploadCompanyLogo,
  useDeleteCompanyLogo,
  useDiscoverCompanyLogo,
} from "@/hooks/useCompanyMutations";

/** Mirrors the server cap. Purely for a fast, friendly error — the server sniff is the real gate. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);

interface CompanyLogoFieldProps {
  companyId: string;
  companyName: string;
  logoUrl: string | null;
  logoSource?: string | null;
  hasWebsite: boolean;
  /** Verified companies stage the change for admin review instead of applying it. */
  isVerified: boolean;
  /**
   * Re-read the company after a logo write. Required because the company page
   * holds its record in plain React state (useCompanyPageData), so the query
   * invalidation the mutation hooks do reaches the directory and dashboard but
   * not the record this field renders from — without it, a successful discovery
   * keeps showing the logo it just replaced.
   */
  onLogoChanged?: () => void | Promise<void>;
}

/**
 * Self-contained logo editor.
 *
 * Deliberately saves immediately rather than joining the sheet's transactional
 * Save: the upload is a separate multipart request, and holding bytes in memory
 * until an unrelated Save press would make a failure much harder to explain.
 * The surrounding sheet already carries a "saves immediately" hint.
 */
export function CompanyLogoField({
  companyId,
  companyName,
  logoUrl,
  logoSource,
  hasWebsite,
  isVerified,
  onLogoChanged,
}: CompanyLogoFieldProps) {
  const t = useTranslations("CompanyPage");
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Set only once a change has actually been staged, so a verified company is
  // not told its logo is "awaiting review" when nothing is pending.
  const [staged, setStaged] = useState(false);

  const uploadMutation = useUploadCompanyLogo();
  const deleteMutation = useDeleteCompanyLogo();
  const discoverMutation = useDiscoverCompanyLogo();

  const busy =
    uploadMutation.isPending || deleteMutation.isPending || discoverMutation.isPending;

  // Object URLs leak until revoked, and this component can churn through
  // several in one sheet session.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleFile = async (file: File) => {
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t("logo.tooLarge"));
      return;
    }
    if (!ACCEPTED.has(file.type)) {
      toast.error(t("logo.badType"));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    try {
      const result = await uploadMutation.mutateAsync({ companyId, file });
      setStaged(result.pending);
      // The preview stays up while this resolves, so there is no flash.
      await onLogoChanged?.();
      toast.success(result.pending ? t("logo.pendingReview") : t("logo.uploadSuccess"));
    } catch (error) {
      console.error("Logo upload failed:", error);
      setPreview(null);
      toast.error(t("logo.uploadError"));
    }
  };

  const handleRemove = async () => {
    try {
      const result = await deleteMutation.mutateAsync(companyId);
      setStaged(result.pending);
      await onLogoChanged?.();
      setPreview(null);
      toast.success(result.pending ? t("logo.pendingReview") : t("logo.removeSuccess"));
    } catch (error) {
      console.error("Logo removal failed:", error);
      toast.error(t("logo.removeError"));
    }
  };

  const handleDiscover = async () => {
    try {
      const result = await discoverMutation.mutateAsync(companyId);
      if (result.ok) {
        // Discovery writes straight to the column — it is not a user-submitted
        // change and never enters the review queue.
        setStaged(false);
        // Refresh before clearing the preview: dropping to the stale prop first
        // would flash the old logo back in.
        await onLogoChanged?.();
        setPreview(null);
        toast.success(t("logo.discoverSuccess"));
      } else if (result.reason === "no_candidates" || result.reason === "no_valid_image") {
        toast.error(t("logo.discoverNotFound"));
      } else if (result.reason === "no_website") {
        toast.error(t("logo.discoverNoWebsite"));
      } else {
        toast.error(t("logo.discoverError"));
      }
    } catch (error) {
      console.error("Logo discovery failed:", error);
      toast.error(t("logo.discoverError"));
    }
  };

  const displayUrl = preview ?? logoUrl;

  return (
    <div className="space-y-3">
      <Label>{t("logo.label")}</Label>

      <div className="flex items-center gap-4">
        <CompanyLogo
          companyName={companyName}
          logoUrl={displayUrl}
          size="lg"
          fallback="icon"
        />

        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset so re-picking the same file fires change again.
              e.target.value = "";
              if (file) void handleFile(file);
            }}
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5 mr-1.5" />
            )}
            {uploadMutation.isPending
              ? t("logo.uploading")
              : logoUrl
                ? t("logo.replace")
                : t("logo.upload")}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !hasWebsite}
            title={hasWebsite ? undefined : t("logo.discoverNoWebsite")}
            onClick={handleDiscover}
          >
            {discoverMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Globe className="w-3.5 h-3.5 mr-1.5" />
            )}
            {discoverMutation.isPending ? t("logo.discovering") : t("logo.discover")}
          </Button>

          {logoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={handleRemove}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {t("logo.remove")}
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("logo.hint")}</p>

      {logoSource === "website" && (
        <p className="text-xs text-muted-foreground italic">{t("logo.sourceWebsite")}</p>
      )}

      {isVerified && staged && (
        <p className="text-xs text-amber-700">{t("logo.pendingReview")}</p>
      )}
    </div>
  );
}
