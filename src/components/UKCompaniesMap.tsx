import React, { useEffect, useState } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Building2, MapPin } from "lucide-react";

// UK postcode to coordinates mapping (sample data for East Midlands region)
const postcodeCoordinates: { [key: string]: { x: number; y: number; name: string } } = {
  'NG': { x: 52, y: 38, name: 'Nottingham' },
  'DE': { x: 48, y: 40, name: 'Derby' },
  'LE': { x: 55, y: 45, name: 'Leicester' },
  'CV': { x: 45, y: 52, name: 'Coventry' },
  'B': { x: 38, y: 48, name: 'Birmingham' },
  'WV': { x: 35, y: 42, name: 'Wolverhampton' },
  'S': { x: 48, y: 28, name: 'Sheffield' },
  'DN': { x: 55, y: 25, name: 'Doncaster' },
  'LN': { x: 70, y: 40, name: 'Lincoln' },
  'PE': { x: 82, y: 52, name: 'Peterborough' },
};

interface Company {
  id: string;
  company_name: string;
  postcode: string | null;
  status: string;
}

interface CompanyMarker {
  company: Company;
  position: { x: number; y: number; name: string };
}

const UKCompaniesMap = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);

  // Fetch companies from database
  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name, postcode, status')
        .eq('status', 'active')
        .not('postcode', 'is', null);

      if (error) {
        console.error('Error fetching companies:', error);
        return;
      }

      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get position from postcode
  const getPositionFromPostcode = (postcode: string): { x: number; y: number; name: string } | null => {
    if (!postcode) return null;
    
    // Extract postcode area (first part before space or digits)
    const area = postcode.replace(/\s+/g, '').match(/^[A-Z]+/)?.[0];
    if (!area) return null;

    return postcodeCoordinates[area] || null;
  };

  // Get company markers
  const getCompanyMarkers = (): CompanyMarker[] => {
    return companies
      .map(company => {
        const position = getPositionFromPostcode(company.postcode || '');
        if (!position) return null;
        return { company, position };
      })
      .filter((marker): marker is CompanyMarker => marker !== null);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  if (loading) {
    return (
      <div className="w-full h-[450px] flex items-center justify-center bg-gradient-to-br from-muted/30 to-muted/10 rounded-2xl border border-border/20">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading company locations...</p>
        </div>
      </div>
    );
  }

  const companyMarkers = getCompanyMarkers();

  return (
    <div className="relative w-full h-[450px] rounded-2xl overflow-hidden shadow-xl border border-border/20 bg-card">
      {/* Map Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-background/95 to-transparent p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Regional Network</h3>
              <p className="text-sm text-muted-foreground">East Midlands Business Locations</p>
            </div>
          </div>
          <div className="bg-card/90 backdrop-blur-sm px-4 py-2 rounded-xl shadow-md border border-border/20">
            <p className="text-sm font-semibold">
              <span className="text-2xl text-primary font-bold">{companies.length}</span>
              <span className="text-muted-foreground ml-1">Active Companies</span>
            </p>
          </div>
        </div>
      </div>

      {/* SVG Map Container */}
      <div className="absolute inset-0 flex items-center justify-center pt-20">
        <div className="relative">
          <svg
            width="400"
            height="300"
            viewBox="0 0 100 80"
            className="w-full max-w-md h-auto"
          >
            {/* UK Outline (simplified East Midlands region) */}
            <path
              d="M20,20 L80,15 L85,60 L75,75 L25,70 L15,45 Z"
              fill="hsl(var(--muted))"
              stroke="hsl(var(--border))"
              strokeWidth="0.5"
              className="opacity-60"
            />
            
            {/* Regional boundaries */}
            <path
              d="M30,25 L70,22 L75,55 L65,65 L35,62 L25,40 Z"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="0.3"
              strokeDasharray="1,1"
              className="opacity-40"
            />

            {/* Company Markers */}
            {companyMarkers.map((marker, index) => (
              <g key={marker.company.id}>
                {/* Marker circle */}
                <circle
                  cx={marker.position.x}
                  cy={marker.position.y}
                  r={hoveredMarker === marker.company.id ? "2.5" : "2"}
                  fill="hsl(var(--primary))"
                  stroke="white"
                  strokeWidth="0.8"
                  className="cursor-pointer transition-all duration-200 drop-shadow-sm"
                  onMouseEnter={() => setHoveredMarker(marker.company.id)}
                  onMouseLeave={() => setHoveredMarker(null)}
                />
                
                {/* Hover tooltip */}
                {hoveredMarker === marker.company.id && (
                  <g>
                    <rect
                      x={marker.position.x + 3}
                      y={marker.position.y - 8}
                      width="25"
                      height="12"
                      fill="hsl(var(--popover))"
                      stroke="hsl(var(--border))"
                      strokeWidth="0.2"
                      rx="1"
                      className="drop-shadow-lg"
                    />
                    <text
                      x={marker.position.x + 4}
                      y={marker.position.y - 3}
                      fontSize="3"
                      fill="hsl(var(--foreground))"
                      className="font-medium"
                    >
                      {marker.company.company_name.substring(0, 20)}
                    </text>
                    <text
                      x={marker.position.x + 4}
                      y={marker.position.y + 0.5}
                      fontSize="2.5"
                      fill="hsl(var(--muted-foreground))"
                    >
                      {marker.position.name}
                    </text>
                  </g>
                )}
              </g>
            ))}

            {/* Legend */}
            <g transform="translate(5, 65)">
              <circle cx="2" cy="2" r="1.5" fill="hsl(var(--primary))" />
              <text x="5" y="3" fontSize="2.5" fill="hsl(var(--muted-foreground))">
                Company Location
              </text>
            </g>
          </svg>

          {/* Location Labels */}
          <div className="absolute inset-0 pointer-events-none">
            {Object.entries(postcodeCoordinates).slice(0, 4).map(([code, pos]) => (
              <div
                key={code}
                className="absolute text-xs text-muted-foreground font-medium"
                style={{
                  left: `${(pos.x / 100) * 100}%`,
                  top: `${(pos.y / 80) * 100 + 5}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                {pos.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Company List Sidebar */}
      <div className="absolute right-4 top-24 bottom-4 w-64 bg-card/95 backdrop-blur-sm rounded-xl border border-border/20 shadow-lg overflow-hidden">
        <div className="p-4 border-b border-border/20">
          <h4 className="font-semibold text-sm text-foreground flex items-center">
            <MapPin className="w-4 h-4 mr-2 text-primary" />
            Network Companies
          </h4>
        </div>
        <div className="overflow-y-auto max-h-60">
          {companyMarkers.map((marker) => (
            <div
              key={marker.company.id}
              className="p-3 border-b border-border/10 hover:bg-muted/20 transition-colors cursor-pointer"
              onMouseEnter={() => setHoveredMarker(marker.company.id)}
              onMouseLeave={() => setHoveredMarker(null)}
            >
              <p className="font-medium text-sm text-foreground truncate">
                {marker.company.company_name}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {marker.position.name} • {marker.company.postcode}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Decorative overlay */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background/5 via-transparent to-transparent" />
    </div>
  );
};

export default UKCompaniesMap;