"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DollarSign, TrendingUp, RefreshCw } from "lucide-react";
import type { AnalysisUsage } from "@/hooks/useCompanyPageData";

interface IntelligenceTabProps {
  financialData: Record<string, { value: number; confidence: number }> | null;
  analysis: Record<string, unknown> | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  analysisUsage?: AnalysisUsage | null;
  analysisLimitReached?: boolean;
}

export function IntelligenceTab({
  financialData,
  analysis,
  isAnalyzing,
  onAnalyze,
  analysisUsage,
  analysisLimitReached,
}: IntelligenceTabProps) {
  return (
    <div className="space-y-6">
      {/* Financial */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            Financial Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          {financialData && Object.keys(financialData).length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(financialData).map(([key, field]) => (
                <div key={key} className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-xs font-medium text-muted-foreground capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </div>
                  <div className="text-lg font-bold mt-0.5">
                    {typeof field.value === "number"
                      ? `£${field.value.toLocaleString()}`
                      : "N/A"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Confidence: {field.confidence}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No financial data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* AI Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            AI-Generated Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analysis ? (
            <div className="space-y-4">
              {Object.entries(analysis).map(([key, value]) => (
                <div key={key}>
                  <h4 className="text-sm font-semibold capitalize mb-1.5">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </h4>
                  {Array.isArray(value) ? (
                    <ul className="list-disc list-inside space-y-0.5">
                      {value.map((item, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground">
                          {String(item)}
                        </li>
                      ))}
                    </ul>
                  ) : typeof value === "object" && value !== null ? (
                    <pre className="text-xs text-muted-foreground bg-muted p-3 rounded-lg overflow-x-auto">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">{String(value)}</p>
                  )}
                  <Separator className="my-3" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-3">
                No analysis available. Click &quot;Analyze&quot; to generate AI insights.
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button
                  className="btn-cta"
                  onClick={onAnalyze}
                  disabled={isAnalyzing || !!analysisLimitReached}
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 mr-1.5 ${isAnalyzing ? "animate-spin" : ""}`}
                  />
                  {isAnalyzing ? "Analyzing..." : analysisLimitReached ? "Limit Reached" : "Analyze Company"}
                </Button>
                {analysisUsage && (
                  <Badge
                    variant={analysisLimitReached ? "destructive" : "secondary"}
                    className="text-xs"
                  >
                    {analysisUsage.used}/{analysisUsage.limit} this month
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
