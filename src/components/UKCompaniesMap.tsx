import React, { useEffect, useState } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Building2, MapPin } from "lucide-react";
import ukMapSvg from "@/assets/uk-map.svg";

interface Company {
  id: string;
  company_name: string;
  address: string | null;
  postcode: string | null;
  status: string;
}

interface CompanyMarker {
  company: Company;
  position: { x: number; y: number };
  lat: number;
  lon: number;
}

// UK bounding box for coordinate mapping
const UK_BOUNDS = {
  minLat: 49.9,
  maxLat: 58.7,
  minLon: -8.0,
  maxLon: 1.8,
};

// SVG viewBox dimensions from the uploaded SVG
const SVG_VIEWBOX = {
  width: 153.1,
  height: 209.38,
};

const UKCompaniesMap = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);
  const [markers, setMarkers] = useState<CompanyMarker[]>([]);
  const [geocoding, setGeocoding] = useState(false);

  // Fetch companies from database
  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name, address, postcode, status')
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

  // Geocode address to lat/lon using Nominatim (free OpenStreetMap service)
  const geocodeAddress = async (address: string, postcode: string): Promise<{ lat: number; lon: number } | null> => {
    try {
      const searchQuery = address || postcode;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery + ', UK')}&limit=1`,
        {
          headers: {
            'User-Agent': 'UKCompaniesMap/1.0'
          }
        }
      );
      
      if (!response.ok) return null;
      
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
        };
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return null;
  };

  // Convert lat/lon to SVG x/y coordinates
  const latLonToSvgCoords = (lat: number, lon: number): { x: number; y: number } => {
    // Normalize coordinates to 0-1 range
    const normalizedX = (lon - UK_BOUNDS.minLon) / (UK_BOUNDS.maxLon - UK_BOUNDS.minLon);
    const normalizedY = (UK_BOUNDS.maxLat - lat) / (UK_BOUNDS.maxLat - UK_BOUNDS.minLat);

    // Map to SVG viewBox coordinates
    return {
      x: normalizedX * SVG_VIEWBOX.width,
      y: normalizedY * SVG_VIEWBOX.height,
    };
  };

  // Geocode all companies
  const geocodeCompanies = async () => {
    if (companies.length === 0) return;
    
    setGeocoding(true);
    const newMarkers: CompanyMarker[] = [];

    for (const company of companies) {
      const searchAddress = company.address || company.postcode;
      if (!searchAddress) continue;

      const coords = await geocodeAddress(company.address || '', company.postcode || '');
      if (coords) {
        const svgPosition = latLonToSvgCoords(coords.lat, coords.lon);
        newMarkers.push({
          company,
          position: svgPosition,
          lat: coords.lat,
          lon: coords.lon,
        });
      }

      // Rate limit: wait 1 second between requests (Nominatim requirement)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setMarkers(newMarkers);
    setGeocoding(false);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    if (companies.length > 0) {
      geocodeCompanies();
    }
  }, [companies]);

  if (loading) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center bg-gradient-to-br from-muted/30 to-muted/10 rounded-2xl border border-border/20">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading company locations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[600px] rounded-2xl overflow-hidden shadow-xl border border-border/20 bg-card">
      {/* Map Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-background/95 to-transparent p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">UK Company Network</h3>
              <p className="text-sm text-muted-foreground">
                {geocoding ? 'Geocoding locations...' : `${markers.length} active companies`}
              </p>
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
            Live Map
          </div>
        </div>
      </div>

      {/* SVG Map Container */}
      <div className="uk-map relative w-full h-full flex items-center justify-center p-8 pt-24">
        <div className="relative w-full h-full max-w-2xl">
          {/* UK Map SVG */}
          <img 
            src={ukMapSvg} 
            alt="UK Map" 
            className="w-full h-full object-contain opacity-80"
          />
          
          {/* Company Pins */}
          <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${SVG_VIEWBOX.width} ${SVG_VIEWBOX.height}`}>
            {markers.map((marker) => (
              <g key={marker.company.id}>
                {/* Pin */}
                <circle
                  cx={marker.position.x}
                  cy={marker.position.y}
                  r="2"
                  className="fill-primary stroke-background stroke-1 cursor-pointer transition-all hover:r-3"
                  style={{
                    filter: hoveredMarker === marker.company.id ? 'drop-shadow(0 0 8px rgb(var(--primary)))' : 'none',
                  }}
                  onMouseEnter={() => setHoveredMarker(marker.company.id)}
                  onMouseLeave={() => setHoveredMarker(null)}
                />
                
                {/* Tooltip */}
                {hoveredMarker === marker.company.id && (
                  <g>
                    <foreignObject
                      x={marker.position.x + 5}
                      y={marker.position.y - 15}
                      width="120"
                      height="60"
                    >
                      <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-2 shadow-xl">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {marker.company.company_name}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {marker.company.address?.split('\n')[0] || marker.company.postcode}
                        </p>
                      </div>
                    </foreignObject>
                  </g>
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Company List Sidebar */}
      <div className="absolute right-0 top-0 bottom-0 w-80 bg-background/95 backdrop-blur-sm border-l border-border overflow-y-auto">
        <div className="p-6">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center">
            <MapPin className="w-4 h-4 mr-2 text-primary" />
            Active Companies
          </h4>
          <div className="space-y-2">
            {markers.map((marker) => (
              <div
                key={marker.company.id}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  hoveredMarker === marker.company.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border/50 hover:border-border'
                }`}
                onMouseEnter={() => setHoveredMarker(marker.company.id)}
                onMouseLeave={() => setHoveredMarker(null)}
              >
                <p className="text-sm font-medium text-foreground truncate">
                  {marker.company.company_name}
                </p>
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line line-clamp-2">
                  {marker.company.address || marker.company.postcode}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UKCompaniesMap;
