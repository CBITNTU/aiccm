import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Construction companies data from the Excel file
const CONSTRUCTION_COMPANIES = [
  {
    company_name: "Abbotsbury Contractors Limited",
    contact_phone: "01246 273806",
    description: "construction of new residential properties primarily in the derbyshire east midlands and south yorkshire regions",
    companies_house_number: "04948325",
    postcode: "S43 4UL"
  },
  {
    company_name: "Ace Of Space",
    contact_phone: "01246 460055", 
    description: "timber framed buildings",
    postcode: "S44 6RQ"
  },
  {
    company_name: "Appleyard Building & Landscaping",
    contact_phone: "01246 811911",
    description: "building services",
    postcode: "S43 4BF"
  },
  {
    company_name: "Aptus Home Improvements Limited",
    contact_phone: "01246 240668",
    description: "construction installation",
    companies_house_number: "06328095",
    postcode: "S44 6XX"
  },
  {
    company_name: "Arromax Structures Limited",
    contact_phone: "01623 747466",
    description: "constructional engineers",
    companies_house_number: "02271047", 
    postcode: "NG20 9RN"
  },
  {
    company_name: "B Hill",
    contact_phone: "01623 812191",
    description: "builders",
    postcode: "S44 5PY"
  },
  {
    company_name: "Building Product Design Limited",
    contact_phone: "01773 814102",
    description: "manufacture and distribution of building products",
    companies_house_number: "03944123",
    postcode: "NG16 6NS"
  },
  {
    company_name: "Butler & Brooks Builders",
    contact_phone: "07946 331664",
    description: "builders",
    postcode: "DE55 2LE"
  },
  {
    company_name: "Chapman Brothers (Sheffield) Limited",
    contact_phone: "0114 2486937",
    description: "builders and property developers",
    companies_house_number: "02029943",
    postcode: "S21 2JF"
  },
  {
    company_name: "Cjb Builders & Son",
    contact_phone: "01246 827918",
    description: "building services",
    postcode: "S44 6PA"
  },
  {
    company_name: "Cosi Home Services",
    contact_phone: "01246 819314",
    description: "builders",
    postcode: "S43 4AX"
  },
  {
    company_name: "Crawler Cranes Limited", 
    contact_phone: "01246 570639",
    description: "wholesale of mining, construction and civil engineering machinery",
    companies_house_number: "04747136",
    postcode: "S43 4PR"
  },
  {
    company_name: "De Wynter's Developments Limited",
    contact_phone: "07830 141233",
    description: "specialised construction activities",
    companies_house_number: "06005841",
    postcode: "S42 5EF"
  },
  {
    company_name: "Dj Smith Builders",
    contact_phone: "01773 812409",
    description: "builders",
    postcode: "DE55 2ER"
  },
  {
    company_name: "Eurocell Building Plastics Limited",
    contact_phone: "033 30323087",
    description: "sells and distributes a range of eurocell branded pvc doors and roofline products",
    companies_house_number: "03071407",
    postcode: "OL6 7PP"
  },
  {
    company_name: "Eurocell Plc",
    contact_phone: "01773 842100", 
    description: "extrusion and supply of pvc window and building products",
    companies_house_number: "08654028",
    postcode: "DE55 2DT"
  },
  {
    company_name: "Exclusive Building Services",
    contact_phone: "01623 742124",
    description: "builders",
    postcode: "NG20 8JR"
  },
  {
    company_name: "Gelder",
    contact_phone: "01246 812984",
    description: "builders", 
    postcode: "S43 4WW"
  },
  {
    company_name: "Hvl Solutions Limited",
    contact_phone: "01332 703664",
    description: "construction of water projects",
    companies_house_number: "08881199",
    postcode: "DE5 3BZ"
  },
  {
    company_name: "I & N Site Servicing Limited",
    contact_phone: "01623 741174",
    description: "construction installation",
    companies_house_number: "05674473",
    postcode: "NG20 8SS"
  },
  {
    company_name: "Ian Varley Building",
    contact_phone: "01246 828833",
    description: "builders",
    postcode: "S44 6QF"
  },
  {
    company_name: "J Paul Green",
    contact_phone: "01246 700124",
    description: "builders",
    postcode: "S44 6DH"
  },
  {
    company_name: "Jfs",
    contact_phone: "01623 810186",
    description: "builders",
    postcode: "NG19 7PL"
  },
  {
    company_name: "Jj Building Services (Mansfield) Limited",
    contact_phone: "01623 847448",
    description: "builders",
    companies_house_number: "10086332",
    postcode: "NG20 0PS"
  },
  {
    company_name: "Km Tomlinson Building",
    contact_phone: "07976 068164",
    description: "builders",
    postcode: "DE55 5BD"
  },
  {
    company_name: "Lb & J Mather Limited",
    contact_phone: "07836 671305",
    description: "building plumbing and joinery",
    companies_house_number: "05644025",
    postcode: "S45 8AW"
  },
  {
    company_name: "Legwear International Ltd",
    contact_phone: "01773 713200",
    description: "to bring the building to a high standard",
    companies_house_number: "03319018",
    postcode: "DE55 4QT"
  },
  {
    company_name: "Lyncroft Care Home",
    contact_phone: "01773 580963",
    description: "sheltered housing",
    postcode: "DE55 2AS"
  },
  {
    company_name: "Martin L Smith Building Services",
    contact_phone: "01623 746329",
    description: "building services",
    postcode: "NG20 9RN"
  },
  {
    company_name: "Mr I Godley",
    contact_phone: "01246 813916",
    description: "builders",
    postcode: "S43 4SY"
  },
  {
    company_name: "P.j. Whitehurst (Building) Limited",
    contact_phone: "01773 811292",
    description: "general construction and civil engineering",
    companies_house_number: "00839219",
    postcode: "DE55 2AT"
  },
  {
    company_name: "R & P Atterbury (Builders) Limited",
    contact_phone: "01773 875223",
    description: "general construction and civil engineer",
    companies_house_number: "04160035",
    postcode: "DE55 5PF"
  },
  {
    company_name: "R Widdowson",
    contact_phone: "01246 828435",
    description: "builders",
    postcode: "S44 6SG"
  },
  {
    company_name: "Re-Bar Construction Services Limited",
    contact_phone: "01246 826405",
    description: "civil engineering and building contractors",
    companies_house_number: "02372022",
    postcode: "S44 6EY"
  },
  {
    company_name: "Subframes Uk Limited",
    contact_phone: "01773 590100",
    description: "manufacture of builders ware of plastic",
    companies_house_number: "04633151",
    postcode: "DE55 5NH"
  },
  {
    company_name: "Trustseal Limited",
    contact_phone: "01909 722662",
    description: "specialised construction",
    companies_house_number: "03109968",
    postcode: "S80 3LH"
  },
  {
    company_name: "Turner & Wilson (Whitwell) Limited",
    contact_phone: "01909 722773",
    description: "repairs to buildings in every sense also funeral directors",
    companies_house_number: "04572284",
    postcode: "S80 4QJ"
  },
  {
    company_name: "W.h. Davis Limited",
    contact_phone: "01623 241600",
    description: "engineering including container and wagon building and repairs",
    companies_house_number: "01797397",
    postcode: "NG20 9SA"
  },
  {
    company_name: "Wards Builders Limited",
    contact_phone: "01246 240749",
    description: "general construction and civil engineering",
    companies_house_number: "04978361",
    postcode: "S44 6PB"
  },
  {
    company_name: "Waystone Limited",
    contact_phone: "01773 524500",
    description: "property development and building and civil engineering contractors",
    companies_house_number: "02451184",
    postcode: "S43 4PZ"
  },
  {
    company_name: "Wh Buck & Son",
    contact_phone: "07775 804442",
    description: "builders",
    postcode: "S44 6BE"
  },
  {
    company_name: "William Huckle Ltd",
    contact_phone: "07917 734901",
    description: "construction installation",
    companies_house_number: "07401884",
    postcode: "S44 6DJ"
  },
  {
    company_name: "Woburn Houses",
    contact_phone: "01773 812477",
    description: "sheltered housing",
    postcode: "DE55 5HE"
  },
  {
    company_name: "Wredmile",
    contact_phone: "01773 591315",
    description: "house builders",
    postcode: "DE55 5QD"
  }
];

const AdminDataImport = () => {
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
          // Check if company already exists
          const { data: existing } = await supabase
            .from('companies')
            .select('id')
            .eq('company_name', company.company_name)
            .eq('is_system_company', true)
            .maybeSingle();

          if (!existing) {
            // Insert as system company
            const { error } = await supabase
              .from('companies')
              .insert({
                ...company,
                user_id: null,
                is_system_company: true,
                status: 'active'
              });

            if (error) {
              setErrors(prev => [...prev, `Failed to import ${company.company_name}: ${error.message}`]);
            } else {
              successCount++;
            }
          } else {
            // Company already exists
            successCount++;
          }
        } catch (err) {
          setErrors(prev => [...prev, `Error importing ${company.company_name}: ${err}`]);
        }

        setImportedCount(successCount);
        setProgress(((i + 1) / total) * 100);
      }

      toast.success(`Import completed! ${successCount} companies processed successfully.`);
    } catch (error) {
      toast.error("Import failed: " + error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Construction Companies Data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            This will import {CONSTRUCTION_COMPANIES.length} construction companies from the Bolsover Excel file into the database.
          </p>
          
          {!isImporting && (
            <Button onClick={handleImportCompanies} className="w-full">
              Import Companies Data
            </Button>
          )}
          
          {isImporting && (
            <div className="space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-center">
                Importing... {Math.round(progress)}% complete ({importedCount} of {CONSTRUCTION_COMPANIES.length})
              </p>
            </div>
          )}
        </div>

        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">Import Errors:</p>
                {errors.slice(0, 5).map((error, index) => (
                  <p key={index} className="text-xs">{error}</p>
                ))}
                {errors.length > 5 && (
                  <p className="text-xs">...and {errors.length - 5} more errors</p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminDataImport;