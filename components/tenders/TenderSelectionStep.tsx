"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Search,
  FileText,
  MapPin,
  Calendar,
  DollarSign,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { TenderStatusBadge } from "@/components/tenders/TenderStatusBadge";
import type { TenderRecord } from "@/lib/api/types";

type Tender = TenderRecord;

interface TenderSelectionStepProps {
  selectedTenderId: string | null;
  onTenderSelect: (tenderId: string | null) => void;
}

export function TenderSelectionStep({
  selectedTenderId,
  onTenderSelect,
}: TenderSelectionStepProps) {
  const t = useTranslations("TenderSelectionStep");
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchTenders = async () => {
      try {
        setLoading(true);
        const result = await api.getAvailableTendersSearch();
        setTenders((result.tenders as unknown as Tender[]) || []);
      } catch (error) {
        console.error("Error fetching tenders:", error);
        toast.error(t("loadError"));
      } finally {
        setLoading(false);
      }
    };

    fetchTenders();
  }, [t]);

  const filteredTenders = tenders.filter((tender) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      tender.title?.toLowerCase().includes(searchLower) ||
      tender.buyer?.toLowerCase().includes(searchLower) ||
      tender.description?.toLowerCase().includes(searchLower) ||
      tender.location?.toLowerCase().includes(searchLower) ||
      tender.referenceNumber?.toLowerCase().includes(searchLower)
    );
  });

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return t("notSpecified");
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatBudget = (min?: number | null, max?: number | null): string => {
    if (!min && !max) return t("notSpecified");
    if (min && max && min !== max) {
      return `£${(min / 1000).toFixed(0)}k - £${(max / 1000).toFixed(0)}k`;
    }
    if (min) return `£${(min / 1000).toFixed(0)}k+`;
    if (max) return `Up to £${(max / 1000).toFixed(0)}k`;
    return t("notSpecified");
  };

  const isDeadlineSoon = (deadline: string | null): boolean => {
    if (!deadline) return false;
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysDiff = Math.ceil(
      (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return daysDiff <= 7 && daysDiff >= 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">{t("loading")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {t("description")}
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {filteredTenders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {tenders.length === 0
              ? t("noOpenTenders")
              : t("noMatchingTenders")}
          </CardContent>
        </Card>
      ) : (
        <RadioGroup
          value={selectedTenderId || ""}
          onValueChange={(value) => onTenderSelect(value || null)}
          className="space-y-3"
        >
          <div className="max-h-[500px] overflow-y-auto space-y-3">
            {filteredTenders.map((tender) => {
              const isSelected = selectedTenderId === tender.id;
              const deadlineSoon = isDeadlineSoon(tender.deadline);

              return (
                <Card
                  key={tender.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isSelected ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => onTenderSelect(tender.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <RadioGroupItem
                        value={tender.id}
                        id={`tender-${tender.id}`}
                        className="mt-1"
                      />
                      <Label
                        htmlFor={`tender-${tender.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="font-semibold text-lg mb-1">
                                {tender.title}
                              </h3>
                            {tender.referenceNumber && (
                                <p className="text-xs text-muted-foreground mb-2">
                                  {t("ref", { ref: tender.referenceNumber })}
                                </p>
                              )}
                              {tender.description && (
                                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                  {tender.description}
                                </p>
                              )}
                            </div>
                            <TenderStatusBadge status={tender.status} />
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                {t("buyer")}{" "}
                              </span>
                              <span className="font-medium">
                                {tender.buyer}
                              </span>
                            </div>
                            {tender.location && (
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {t("location")}{" "}
                                </span>
                                <span className="font-medium">
                                  {tender.location}
                                </span>
                              </div>
                            )}
                            {tender.deadline && (
                              <div className="flex items-center gap-2">
                                <Calendar
                                  className={`w-4 h-4 ${
                                    deadlineSoon
                                      ? "text-red-500"
                                      : "text-muted-foreground"
                                  }`}
                                />
                                <span className="text-muted-foreground">
                                  {t("deadline")}{" "}
                                </span>
                                <span
                                  className={`font-medium ${
                                    deadlineSoon ? "text-red-600" : ""
                                  }`}
                                >
                                  {formatDate(tender.deadline)}
                                </span>
                              </div>
                            )}
                            {(tender.budgetMin || tender.budgetMax) && (
                              <div className="flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {t("budget")}{" "}
                                </span>
                                <span className="font-medium">
                                  {formatBudget(
                                    tender.budgetMin,
                                    tender.budgetMax,
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </RadioGroup>
      )}

      {selectedTenderId && (
        <Card className="bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t("selectedTitle")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("selectedDescription")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
