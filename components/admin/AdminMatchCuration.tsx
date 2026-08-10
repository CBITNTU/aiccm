"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  Banknote,
  Calendar,
  CalendarClock,
  Loader2,
  MapPin,
  Pin,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TenderStatusBadge } from "@/components/tenders/TenderStatusBadge";
import { api, ApiError } from "@/lib/api/client";
import { useDeployment } from "@/lib/deployment/client";
import { formatCurrency, resolveCurrencyConfig } from "@/lib/format/currency";
import { getTenderSourceLabel } from "@/lib/tenders/externalNoticeLink";
import type {
  AdminCuratedMatch,
  CurationRealismIssue,
  TenderRecord,
} from "@/lib/api/types";
import {
  useCreateCuratedMatch,
  useCuratedMatches,
  useDeleteCuratedMatch,
  usePublishCuratedMatch,
  useUnpublishCuratedMatch,
  useUpdateCuratedMatch,
} from "@/hooks/useCuratedMatches";

/**
 * Curated-match console, rendered inside the preparation tabs.
 *
 * Two ways to lift a tender up a company's feed:
 *
 *  - Evidence: the admin writes down something true that the profile doesn't
 *    capture (an unlisted accreditation, prior work with this buyer) and
 *    re-runs deep research with it. The score moves because the model now has
 *    the full picture, and the reasoning on the card stands behind the number.
 *  - Override: the admin sets the shown score directly. The breakdown is
 *    back-solved on publish so the card's own arithmetic still holds.
 *
 * Evidence first — an override with stale reasoning underneath it is the thing
 * a user notices.
 */
export function AdminMatchCuration({ companyId }: { companyId: string }) {
  const t = useTranslations("AdminMatchCuration");

  const { data, isLoading } = useCuratedMatches(companyId);
  const createMutation = useCreateCuratedMatch(companyId);
  const updateMutation = useUpdateCuratedMatch(companyId);
  const publishMutation = usePublishCuratedMatch(companyId);
  const unpublishMutation = useUnpublishCuratedMatch(companyId);
  const deleteMutation = useDeleteCuratedMatch(companyId);

  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TenderRecord[]>([]);

  const [editing, setEditing] = useState<AdminCuratedMatch | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminCuratedMatch | null>(null);
  const [reviewWarnings, setReviewWarnings] = useState<{
    curation: AdminCuratedMatch;
    issues: CurationRealismIssue[];
  } | null>(null);

  const curations = useMemo(() => data?.results ?? [], [data]);
  const publishedCount = curations.filter((c) => c.status === "published").length;

  const runSearch = async () => {
    if (!keyword.trim()) return;
    setSearching(true);
    try {
      // Searches the whole tender table, not just this company's matches — the
      // point is to reach tenders the matcher never surfaced.
      const result = await api.searchTenders({ keyword, pageSize: 20 });
      setSearchResults(result.tenders);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.searchFailed"));
    } finally {
      setSearching(false);
    }
  };

  const addCuration = async (tenderId: string) => {
    try {
      const result = await createMutation.mutateAsync([tenderId]);
      setSearchOpen(false);
      toast.success(
        result.queuedDeepResearch > 0
          ? t("toasts.addedWithResearch")
          : t("toasts.added"),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.addFailed"));
    }
  };

  /**
   * Publishes, and on a guardrail rejection raises the review dialog instead of
   * a toast: the warnings are what the decision is made on, so they belong in
   * front of the button that overrides them rather than beside it.
   */
  const publish = async (curation: AdminCuratedMatch, force = false) => {
    try {
      const result = await publishMutation.mutateAsync({ id: curation.id, force });
      if (result.published) {
        toast.success(t("toasts.published", { score: result.verifiedOverall ?? 0 }));
        setReviewWarnings(null);
        setEditing(null);
      }
    } catch (error) {
      const payload =
        error instanceof ApiError
          ? (error.payload as { issues?: CurationRealismIssue[]; needsAcknowledgement?: boolean })
          : null;
      const issues = payload?.issues ?? [];
      if (issues.length > 0) {
        setReviewWarnings({ curation, issues });
      } else {
        toast.error(
          error instanceof Error ? error.message : t("toasts.publishFailed"),
        );
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t("title")}</h3>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={() => setSearchOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addTender")}
        </Button>
      </div>

      {publishedCount >= 5 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("tooManyWarning", { count: publishedCount })}</span>
        </div>
      )}

      {curations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {curations.map((curation) => (
            <CurationRow
              key={curation.id}
              curation={curation}
              onEdit={() => setEditing(curation)}
              onDelete={() => setConfirmDelete(curation)}
              onUnpublish={() => unpublishMutation.mutate(curation.id)}
            />
          ))}
        </div>
      )}

      {/* Tender picker */}
      <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{t("picker.title")}</SheetTitle>
            <SheetDescription>{t("picker.description")}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <div className="flex gap-2">
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder={t("picker.searchPlaceholder")}
              />
              <Button onClick={runSearch} disabled={searching}>
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            {searchResults.map((tender) => (
              <TenderSearchResult
                key={tender.id}
                tender={tender}
                disabled={createMutation.isPending}
                onAdd={() => addCuration(tender.id)}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Editor */}
      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {editing && (
            <CurationEditor
              curation={editing}
              onSave={async (updates) => {
                const result = await updateMutation.mutateAsync({
                  id: editing.id,
                  updates,
                });
                if (updates.rerun) {
                  toast.success(
                    t("toasts.rerunDone", { score: result.rerunScore ?? 0 }),
                  );
                } else {
                  toast.success(t("toasts.saved"));
                }
                setEditing(null);
              }}
              onPublish={() => publish(editing)}
              saving={updateMutation.isPending || publishMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Publish confirmation — raised only when the guardrails have something
          to say. Blocking issues get no override button; they are not waivable. */}
      <Dialog
        open={!!reviewWarnings}
        onOpenChange={(open) => !open && setReviewWarnings(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewWarnings?.issues.some((i) => i.severity === "block")
                ? t("warnings.blockedTitle")
                : t("warnings.dialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {reviewWarnings?.issues.some((i) => i.severity === "block")
                ? t("warnings.blockedDescription")
                : t("warnings.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <RealismIssueList issues={reviewWarnings?.issues ?? []} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewWarnings(null)}>
              {t("warnings.back")}
            </Button>
            {!reviewWarnings?.issues.some((i) => i.severity === "block") && (
              <Button
                disabled={publishMutation.isPending}
                onClick={() => {
                  if (reviewWarnings) publish(reviewWarnings.curation, true);
                }}
              >
                {publishMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t("publishAnyway")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("deleteDialog.description", {
                score: confirmDelete?.realScore ?? 0,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              {t("deleteDialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDelete) deleteMutation.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              {t("deleteDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The realism guardrails, rendered the same way everywhere they appear — the
 * row, the editor and the publish confirmation — so an admin who has read them
 * once on the card recognises them in the dialog instead of re-reading.
 */
function RealismIssueList({
  issues,
  className = "",
}: {
  issues: CurationRealismIssue[];
  className?: string;
}) {
  const t = useTranslations("AdminMatchCuration");
  if (issues.length === 0) return null;

  return (
    <div className={`space-y-1 ${className}`}>
      {issues.map((issue) => (
        <p
          key={issue.code}
          className={`flex items-start gap-1.5 text-xs ${
            issue.severity === "block" ? "text-destructive" : "text-amber-700"
          }`}
        >
          {issue.severity === "block" ? (
            <Ban className="mt-0.5 h-3 w-3 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          )}
          {t(`realism.${issue.code}`, issue.values ?? {})}
        </p>
      ))}
    </div>
  );
}

/** Whole days from now until `deadline` — negative once it has passed. */
function daysUntil(deadline: string): number {
  return Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}

/**
 * One row of the tender picker. The admin is choosing a tender to lift out of
 * the whole table, so the row carries what makes that call — is it still live,
 * how big is it, where is it, and which portal it came from — rather than just
 * a title to click.
 */
function TenderSearchResult({
  tender,
  disabled,
  onAdd,
}: {
  tender: TenderRecord;
  disabled: boolean;
  onAdd: () => void;
}) {
  const t = useTranslations("AdminMatchCuration");
  const locale = useLocale();
  const { currency } = useDeployment();
  const tenderCurrency = resolveCurrencyConfig(tender.currency, currency);
  const sourceLabel = getTenderSourceLabel(tender.documents);

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const daysToDeadline = tender.deadline ? daysUntil(tender.deadline) : null;
  const deadlineTone =
    daysToDeadline == null
      ? ""
      : daysToDeadline < 0
        ? "bg-destructive/10 text-destructive"
        : daysToDeadline <= 7
          ? "bg-amber-100 text-amber-900"
          : "bg-muted";

  const { budgetMin: min, budgetMax: max } = tender;
  const budget =
    min != null && max != null && min !== max
      ? `${formatCurrency(min, tenderCurrency)} – ${formatCurrency(max, tenderCurrency)}`
      : min != null
        ? formatCurrency(min, tenderCurrency)
        : max != null
          ? formatCurrency(max, tenderCurrency)
          : t("picker.budgetNotDisclosed");

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{tender.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {tender.referenceNumber && (
              <span className="mr-2">
                {t("picker.ref", { reference: tender.referenceNumber })}
              </span>
            )}
            {tender.buyer}
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={disabled} onClick={onAdd}>
          {t("picker.add")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <TenderStatusBadge status={tender.status} size="sm" />
        {sourceLabel && (
          <Badge variant="secondary" className="font-normal">
            {sourceLabel}
          </Badge>
        )}
        {tender.location && (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
            <MapPin className="h-3 w-3" />
            {tender.location}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
          <Banknote className="h-3 w-3" />
          {budget}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${
            tender.deadline ? deadlineTone : "bg-muted"
          }`}
        >
          <CalendarClock className="h-3 w-3" />
          {tender.deadline
            ? daysToDeadline != null && daysToDeadline < 0
              ? t("picker.deadlinePassed", { date: formatDate(tender.deadline) })
              : t("picker.closes", { date: formatDate(tender.deadline) })
            : t("picker.noDeadline")}
        </span>
        {tender.publicationDate && (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {t("picker.published", { date: formatDate(tender.publicationDate) })}
          </span>
        )}
      </div>
    </div>
  );
}

function CurationRow({
  curation,
  onEdit,
  onDelete,
  onUnpublish,
}: {
  curation: AdminCuratedMatch;
  onEdit: () => void;
  onDelete: () => void;
  onUnpublish: () => void;
}) {
  const t = useTranslations("AdminMatchCuration");
  const shown = curation.curatedScore ?? curation.realScore ?? 0;
  const blocking = curation.realismIssues.some((i) => i.severity === "block");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              {curation.tender.title}
            </CardTitle>
            <p className="truncate text-sm text-muted-foreground">
              {curation.tender.buyer}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {curation.pinned && (
              <Badge variant="secondary">
                <Pin className="mr-1 h-3 w-3" />
                {t("status.pinned")}
              </Badge>
            )}
            <Badge
              variant={curation.status === "published" ? "default" : "outline"}
            >
              {t(`status.${curation.status}`)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span>
            {t("shownScore")}:{" "}
            <strong className="text-base">{shown}%</strong>
          </span>
          <span className="text-muted-foreground">
            {t("realScore")}:{" "}
            {curation.hasDeepResult ? `${curation.realScore}%` : t("notAnalysed")}
          </span>
          {!curation.hasDeepResult && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("researchPending")}
            </span>
          )}
        </div>

        <RealismIssueList issues={curation.realismIssues} />

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit} disabled={blocking}>
            {t("edit")}
          </Button>
          {curation.status === "published" && (
            <Button size="sm" variant="ghost" onClick={onUnpublish}>
              {t("unpublish")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {t("remove")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Mirrors the clamp the PATCH route applies (a score below 1 is swallowed by the
// feed's own 0% floor), so what the field shows is what gets stored.
const MIN_CURATED_SCORE = 1;
const MAX_CURATED_SCORE = 100;

/** Keeps the field inside 1–100 as it is typed; "" stays "" (no override). */
function clampScoreInput(raw: string, { onBlur = false } = {}) {
  if (!raw.trim()) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n);
  // The lower bound is only applied on blur — clamping it per keystroke would
  // rewrite the leading "0" of a number still being typed.
  const floor = onBlur ? MIN_CURATED_SCORE : 0;
  return String(Math.min(Math.max(rounded, floor), MAX_CURATED_SCORE));
}

function CurationEditor({
  curation,
  onSave,
  onPublish,
  saving,
}: {
  curation: AdminCuratedMatch;
  onSave: (updates: {
    evidenceNote?: string | null;
    internalNote?: string | null;
    curatedScore?: number | null;
    pinned?: boolean;
    pinRank?: number | null;
    curatedMatchReasons?: string[];
    curatedSummary?: string | null;
    rerun?: boolean;
  }) => Promise<void>;
  onPublish: () => void;
  saving: boolean;
}) {
  const t = useTranslations("AdminMatchCuration");
  const blocking = curation.realismIssues.some((i) => i.severity === "block");

  const [evidenceNote, setEvidenceNote] = useState(curation.evidenceNote ?? "");
  const [internalNote, setInternalNote] = useState(curation.internalNote ?? "");
  const [curatedScore, setCuratedScore] = useState(
    curation.curatedScore != null ? String(curation.curatedScore) : "",
  );
  const [pinned, setPinned] = useState(curation.pinned);
  const [pinRank, setPinRank] = useState(
    curation.pinRank != null ? String(curation.pinRank) : "",
  );
  const [reasons, setReasons] = useState(
    (curation.curatedMatchReasons ?? curation.realMatchReasons).join("\n"),
  );
  const [summary, setSummary] = useState(curation.curatedSummary ?? "");

  const collect = (rerun = false) => ({
    evidenceNote: evidenceNote.trim() || null,
    internalNote: internalNote.trim() || null,
    curatedScore: curatedScore.trim() ? Number(curatedScore) : null,
    pinned,
    pinRank: pinRank.trim() ? Number(pinRank) : null,
    curatedMatchReasons: reasons
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean),
    curatedSummary: summary.trim() || null,
    rerun,
  });

  return (
    <div className="space-y-6 p-4">
      <SheetHeader className="p-0">
        <SheetTitle>{curation.tender.title}</SheetTitle>
        <SheetDescription>{curation.tender.buyer}</SheetDescription>
      </SheetHeader>

      {/* The guardrails are shown here rather than only on publish, so the admin
          can fix the number before committing to it. */}
      {curation.realismIssues.length > 0 && (
        <section
          className={`space-y-2 rounded-md border p-4 ${
            blocking
              ? "border-destructive/40 bg-destructive/5"
              : "border-amber-300 bg-amber-50"
          }`}
        >
          <h4 className="text-sm font-semibold">
            {blocking ? t("warnings.blockedTitle") : t("warnings.title")}
          </h4>
          <RealismIssueList issues={curation.realismIssues} />
          <p className="text-xs text-muted-foreground">
            {t("warnings.savedStateHelp")}
          </p>
        </section>
      )}

      {/* Evidence mode */}
      <section className="space-y-3 rounded-md border p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          <h4 className="text-sm font-semibold">{t("evidence.title")}</h4>
        </div>
        <p className="text-xs text-muted-foreground">{t("evidence.help")}</p>
        <Textarea
          value={evidenceNote}
          onChange={(e) => setEvidenceNote(e.target.value)}
          rows={4}
          placeholder={t("evidence.placeholder")}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={saving || !evidenceNote.trim()}
          onClick={() => onSave(collect(true))}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t("evidence.rerun")}
        </Button>
      </section>

      {/* Override mode */}
      <section className="space-y-3 rounded-md border p-4">
        <h4 className="text-sm font-semibold">{t("override.title")}</h4>
        <p className="text-xs text-muted-foreground">{t("override.help")}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="curatedScore">{t("override.score")}</Label>
            <Input
              id="curatedScore"
              type="number"
              inputMode="numeric"
              min={MIN_CURATED_SCORE}
              max={MAX_CURATED_SCORE}
              step={1}
              value={curatedScore}
              onChange={(e) => setCuratedScore(clampScoreInput(e.target.value))}
              onBlur={(e) =>
                setCuratedScore(clampScoreInput(e.target.value, { onBlur: true }))
              }
              placeholder={String(curation.realScore ?? "")}
            />
            <p className="text-xs text-muted-foreground">
              {t("override.scoreHelp", {
                min: MIN_CURATED_SCORE,
                max: MAX_CURATED_SCORE,
              })}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pinRank">{t("override.pinRank")}</Label>
            <Input
              id="pinRank"
              type="number"
              value={pinRank}
              onChange={(e) => setPinRank(e.target.value)}
              disabled={!pinned}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={pinned}
            onCheckedChange={(v) => setPinned(v === true)}
          />
          {t("override.pin")}
        </label>
        <p className="text-xs text-muted-foreground">{t("override.pinHelp")}</p>

        <div className="space-y-1.5">
          <Label htmlFor="reasons">{t("override.reasons")}</Label>
          <Textarea
            id="reasons"
            value={reasons}
            onChange={(e) => setReasons(e.target.value)}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            {t("override.reasonsHelp")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="summary">{t("override.summary")}</Label>
          <Textarea
            id="summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
          />
        </div>
      </section>

      <div className="space-y-1.5">
        <Label htmlFor="internalNote">{t("internalNote")}</Label>
        <Textarea
          id="internalNote"
          value={internalNote}
          onChange={(e) => setInternalNote(e.target.value)}
          rows={2}
          placeholder={t("internalNotePlaceholder")}
        />
        <p className="text-xs text-muted-foreground">{t("internalNoteHelp")}</p>
      </div>

      {/* Two buttons only: publishing through a warning is confirmed in a dialog
          raised by the failed attempt, not chosen up front. */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={saving} onClick={() => onSave(collect())}>
          {t("save")}
        </Button>
        <Button disabled={saving || blocking} onClick={onPublish}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t("publish")}
        </Button>
      </div>
    </div>
  );
}
