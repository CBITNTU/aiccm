"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Search,
  FileText,
  MapPin,
  Calendar,
  DollarSign,
  Loader2,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";

interface Tender {
  id: string;
  title: string;
  buyer: string;
  deadline: string | null;
  status: string | null;
  location: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  description: string | null;
  referenceNumber: string | null;
}

interface TenderStepProps {
  selectedTenderId: string | null;
  onTenderSelect: (tenderId: string | null) => void;
  onSkip?: () => void;
}

export function TenderStep({
  selectedTenderId,
  onTenderSelect,
  onSkip,
}: TenderStepProps) {
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
        toast.error("Failed to load tenders");
      } finally {
        setLoading(false);
      }
    };

    fetchTenders();
  }, []);

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
    if (!dateString) return "Not specified";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatBudget = (min?: number | null, max?: number | null): string => {
    if (!min && !max) return "Not specified";
    if (min && max && min !== max) {
      return `£${(min / 1000).toFixed(0)}k - £${(max / 1000).toFixed(0)}k`;
    }
    if (min) return `£${(min / 1000).toFixed(0)}k+`;
    if (max) return `Up to £${(max / 1000).toFixed(0)}k`;
    return "Not specified";
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
        <span className="ml-3 text-muted-foreground">Loading tenders...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <p className="text-sm text-muted-foreground">
            Select the tender you want to create a project for. This will be the
            target tender for your project team.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tenders by title, buyer, location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} className="shrink-0">
            <SkipForward className="w-4 h-4 mr-2" />
            Skip this step
          </Button>
        )}
      </div>

      {filteredTenders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {tenders.length === 0
              ? "No open tenders available."
              : "No tenders match your search."}
          </CardContent>
        </Card>
      ) : (
        <RadioGroup
          value={selectedTenderId || ""}
          onValueChange={(value) => onTenderSelect(value || null)}
          className="space-y-3"
        >
          <div className="space-y-3 overflow-y-auto pr-2">
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
                                  Ref: {tender.referenceNumber}
                                </p>
                              )}
                              {tender.description && (
                                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                  {tender.description}
                                </p>
                              )}
                            </div>
                            <Badge
                              variant={
                                tender.status === "closing_soon"
                                  ? "destructive"
                                  : "default"
                              }
                            >
                              {tender.status === "closing_soon"
                                ? "Closing Soon"
                                : "Open"}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                Buyer:{" "}
                              </span>
                              <span className="font-medium">
                                {tender.buyer}
                              </span>
                            </div>
                            {tender.location && (
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  Location:{" "}
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
                                  Deadline:{" "}
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
                                  Budget:{" "}
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
                <p className="font-medium">Tender selected</p>
                <p className="text-sm text-muted-foreground">
                  Continue to select capabilities needed for this tender
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
