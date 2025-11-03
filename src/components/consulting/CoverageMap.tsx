import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface CoverageMapProps {
  analysis: {
    requiredCompetencies: string[];
    companyCompetencies: string[];
    missingCompetencies: string[];
    coveragePercentage: number;
    readinessScore: number;
    risks: string[];
  };
}

export function CoverageMap({ analysis }: CoverageMapProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Coverage Map</span>
          <div className="flex items-center gap-4">
            <div className="text-sm font-normal">
              <span className="text-muted-foreground">Coverage: </span>
              <span className="font-semibold">{analysis.coveragePercentage}%</span>
            </div>
            <div className="text-sm font-normal">
              <span className="text-muted-foreground">Readiness: </span>
              <span className="font-semibold">{analysis.readinessScore}/100</span>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Overall Competency Coverage</span>
            <span className="font-medium">{analysis.coveragePercentage}%</span>
          </div>
          <Progress value={analysis.coveragePercentage} className="h-2" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Owned Competencies */}
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Your Competencies ({analysis.companyCompetencies.length})
            </h4>
            <div className="space-y-2">
              {analysis.companyCompetencies.map((comp, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                  <span className="text-sm">{comp}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Missing Competencies */}
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              Missing Competencies ({analysis.missingCompetencies.length})
            </h4>
            <div className="space-y-2">
              {analysis.missingCompetencies.map((comp, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                  <span className="text-sm">{comp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Risks */}
        {analysis.risks && analysis.risks.length > 0 && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Identified Risks
            </h4>
            <div className="space-y-2">
              {analysis.risks.map((risk, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-2 flex-shrink-0" />
                  <span className="text-sm">{risk}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
