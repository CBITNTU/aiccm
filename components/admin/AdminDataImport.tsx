"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

// Construction companies data from the Excel file
const CONSTRUCTION_COMPANIES = [
  {
    companyName: "Abbotsbury Contractors Limited",
    contactPhone: "01246 273806",
    description:
      "construction of new residential properties primarily in the derbyshire east midlands and south yorkshire regions",
    companiesHouseNumber: "04948325",
    postcode: "S43 4UL",
  },
  {
    companyName: "Ace Of Space",
    contactPhone: "01246 460055",
    description: "timber framed buildings",
    postcode: "S44 6RQ",
  },
  {
    companyName: "Appleyard Building & Landscaping",
    contactPhone: "01246 811911",
    description: "building services",
    postcode: "S43 4BF",
  },
  {
    companyName: "Aptus Home Improvements Limited",
    contactPhone: "01246 240668",
    description: "construction installation",
    companiesHouseNumber: "06328095",
    postcode: "S44 6XX",
  },
  {
    companyName: "Arromax Structures Limited",
    contactPhone: "01623 747466",
    description: "constructional engineers",
    companiesHouseNumber: "02271047",
    postcode: "NG20 9RN",
  },
  {
    companyName: "B Hill",
    contactPhone: "01623 812191",
    description: "builders",
    postcode: "S44 5PY",
  },
  {
    companyName: "Building Product Design Limited",
    contactPhone: "01773 814102",
    description: "manufacture and distribution of building products",
    companiesHouseNumber: "03944123",
    postcode: "NG16 6NS",
  },
  {
    companyName: "Butler & Brooks Builders",
    contactPhone: "07946 331664",
    description: "builders",
    postcode: "DE55 2LE",
  },
  {
    companyName: "Chapman Brothers (Sheffield) Limited",
    contactPhone: "0114 2486937",
    description: "builders and property developers",
    companiesHouseNumber: "02029943",
    postcode: "S21 2JF",
  },
  {
    companyName: "Cjb Builders & Son",
    contactPhone: "01246 827918",
    description: "building services",
    postcode: "S44 6PA",
  },
  {
    companyName: "Cosi Home Services",
    contactPhone: "01246 819314",
    description: "builders",
    postcode: "S43 4AX",
  },
  {
    companyName: "Crawler Cranes Limited",
    contactPhone: "01246 570639",
    description:
      "wholesale of mining, construction and civil engineering machinery",
    companiesHouseNumber: "04747136",
    postcode: "S43 4PR",
  },
  {
    companyName: "De Wynter's Developments Limited",
    contactPhone: "07830 141233",
    description: "specialised construction activities",
    companiesHouseNumber: "06005841",
    postcode: "S42 5EF",
  },
  {
    companyName: "Dj Smith Builders",
    contactPhone: "01773 812409",
    description: "builders",
    postcode: "DE55 2ER",
  },
  {
    companyName: "Eurocell Building Plastics Limited",
    contactPhone: "033 30323087",
    description:
      "sells and distributes a range of eurocell branded pvc doors and roofline products",
    companiesHouseNumber: "03071407",
    postcode: "OL6 7PP",
  },
  {
    companyName: "Eurocell Plc",
    contactPhone: "01773 842100",
    description: "extrusion and supply of pvc window and building products",
    companiesHouseNumber: "08654028",
    postcode: "DE55 2DT",
  },
  {
    companyName: "Exclusive Building Services",
    contactPhone: "01623 742124",
    description: "builders",
    postcode: "NG20 8JR",
  },
  {
    companyName: "Gelder",
    contactPhone: "01246 812984",
    description: "builders",
    postcode: "S43 4WW",
  },
  {
    companyName: "Hvl Solutions Limited",
    contactPhone: "01332 703664",
    description: "construction of water projects",
    companiesHouseNumber: "08881199",
    postcode: "DE5 3BZ",
  },
  {
    companyName: "I & N Site Servicing Limited",
    contactPhone: "01623 741174",
    description: "construction installation",
    companiesHouseNumber: "05674473",
    postcode: "NG20 8SS",
  },
  {
    companyName: "Ian Varley Building",
    contactPhone: "01246 828833",
    description: "builders",
    postcode: "S44 6QF",
  },
  {
    companyName: "J Paul Green",
    contactPhone: "01246 700124",
    description: "builders",
    postcode: "S44 6DH",
  },
  {
    companyName: "Jfs",
    contactPhone: "01623 810186",
    description: "builders",
    postcode: "NG19 7PL",
  },
  {
    companyName: "Jj Building Services (Mansfield) Limited",
    contactPhone: "01623 847448",
    description: "builders",
    companiesHouseNumber: "10086332",
    postcode: "NG20 0PS",
  },
  {
    companyName: "Km Tomlinson Building",
    contactPhone: "07976 068164",
    description: "builders",
    postcode: "DE55 5BD",
  },
  {
    companyName: "Lb & J Mather Limited",
    contactPhone: "07836 671305",
    description: "building plumbing and joinery",
    companiesHouseNumber: "05644025",
    postcode: "S45 8AW",
  },
  {
    companyName: "Legwear International Ltd",
    contactPhone: "01773 713200",
    description: "to bring the building to a high standard",
    companiesHouseNumber: "03319018",
    postcode: "DE55 4QT",
  },
  {
    companyName: "Lyncroft Care Home",
    contactPhone: "01773 580963",
    description: "sheltered housing",
    postcode: "DE55 2AS",
  },
  {
    companyName: "Martin L Smith Building Services",
    contactPhone: "01623 746329",
    description: "building services",
    postcode: "NG20 9RN",
  },
  {
    companyName: "Mr I Godley",
    contactPhone: "01246 813916",
    description: "builders",
    postcode: "S43 4SY",
  },
  {
    companyName: "P.j. Whitehurst (Building) Limited",
    contactPhone: "01773 811292",
    description: "general construction and civil engineering",
    companiesHouseNumber: "00839219",
    postcode: "DE55 2AT",
  },
  {
    companyName: "R & P Atterbury (Builders) Limited",
    contactPhone: "01773 875223",
    description: "general construction and civil engineer",
    companiesHouseNumber: "04160035",
    postcode: "DE55 5PF",
  },
  {
    companyName: "R Widdowson",
    contactPhone: "01246 828435",
    description: "builders",
    postcode: "S44 6SG",
  },
  {
    companyName: "Re-Bar Construction Services Limited",
    contactPhone: "01246 826405",
    description: "civil engineering and building contractors",
    companiesHouseNumber: "02372022",
    postcode: "S44 6EY",
  },
  {
    companyName: "Subframes Uk Limited",
    contactPhone: "01773 590100",
    description: "manufacture of builders ware of plastic",
    companiesHouseNumber: "04633151",
    postcode: "DE55 5NH",
  },
  {
    companyName: "Trustseal Limited",
    contactPhone: "01909 722662",
    description: "specialised construction",
    companiesHouseNumber: "03109968",
    postcode: "S80 3LH",
  },
  {
    companyName: "Turner & Wilson (Whitwell) Limited",
    contactPhone: "01909 722773",
    description: "repairs to buildings in every sense also funeral directors",
    companiesHouseNumber: "04572284",
    postcode: "S80 4QJ",
  },
  {
    companyName: "W.h. Davis Limited",
    contactPhone: "01623 241600",
    description:
      "engineering including container and wagon building and repairs",
    companiesHouseNumber: "01797397",
    postcode: "NG20 9SA",
  },
  {
    companyName: "Wards Builders Limited",
    contactPhone: "01246 240749",
    description: "general construction and civil engineering",
    companiesHouseNumber: "04978361",
    postcode: "S44 6PB",
  },
  {
    companyName: "Waystone Limited",
    contactPhone: "01773 524500",
    description:
      "property development and building and civil engineering contractors",
    companiesHouseNumber: "02451184",
    postcode: "S43 4PZ",
  },
  {
    companyName: "Wh Buck & Son",
    contactPhone: "07775 804442",
    description: "builders",
    postcode: "S44 6BE",
  },
  {
    companyName: "William Huckle Ltd",
    contactPhone: "07917 734901",
    description: "construction installation",
    companiesHouseNumber: "07401884",
    postcode: "S44 6DJ",
  },
  {
    companyName: "Woburn Houses",
    contactPhone: "01773 812477",
    description: "sheltered housing",
    postcode: "DE55 5HE",
  },
  {
    companyName: "Wredmile",
    contactPhone: "01773 591315",
    description: "house builders",
    postcode: "DE55 5QD",
  },
];

export function AdminDataImport() {
  const t = useTranslations("AdminDataImport");
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const handleImportCompanies = async () => {
    setIsImporting(true);
    setProgress(0);
    setImportedCount(0);
    setErrors([]);

    try {
      const total = CONSTRUCTION_COMPANIES.length;
      let successCount = 0;

      for (let i = 0; i < total; i++) {
        const company = CONSTRUCTION_COMPANIES[i];

        try {
          await api.adminImportCompany({
            ...company,
            userId: null,
            isSystemCompany: true,
            status: "active",
          });

          successCount++;
        } catch (err) {
          setErrors((prev) => [
            ...prev,
            t("toasts.importError", { name: company.companyName, error: String(err) }),
          ]);
        }

        setImportedCount(successCount);
        setProgress(((i + 1) / total) * 100);
      }

      toast.success(
        t("toasts.importSuccess", { count: successCount }),
      );
    } catch (error) {
      toast.error(t("toasts.importFailed", { error: String(error) }));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            {t("description", { count: CONSTRUCTION_COMPANIES.length })}
          </p>

          {!isImporting && (
            <Button
              onClick={handleImportCompanies}
              className="w-full"
            >
              {t("importButton")}
            </Button>
          )}

          {isImporting && (
            <div className="space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-center">
                {t("importing", {
                  progress: Math.round(progress),
                  imported: importedCount,
                  total: CONSTRUCTION_COMPANIES.length,
                })}
              </p>
            </div>
          )}
        </div>

        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">{t("errorsTitle")}</p>
                {errors.slice(0, 5).map((error, index) => (
                  <p key={index} className="text-xs">
                    {error}
                  </p>
                ))}
                {errors.length > 5 && (
                  <p className="text-xs">
                    {t("moreErrors", { count: errors.length - 5 })}
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
