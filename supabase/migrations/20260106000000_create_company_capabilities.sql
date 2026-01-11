-- Create company capabilities reference table
-- This table stores the master list of available company capabilities
-- Companies can select multiple capabilities from this list

-- Create company_capabilities reference table
CREATE TABLE IF NOT EXISTS public.company_capabilities_ref (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT, -- Optional: for grouping (e.g., "Agriculture & Forestry", "Assembly & Fabrication")
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_company_capabilities_ref_name ON public.company_capabilities_ref(name);
CREATE INDEX IF NOT EXISTS idx_company_capabilities_ref_category ON public.company_capabilities_ref(category);

-- Create junction table for company capabilities
CREATE TABLE IF NOT EXISTS public.company_capabilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES public.company_capabilities_ref(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, capability_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_company_capabilities_company_id ON public.company_capabilities(company_id);
CREATE INDEX IF NOT EXISTS idx_company_capabilities_capability_id ON public.company_capabilities(capability_id);

-- Enable RLS
ALTER TABLE public.company_capabilities_ref ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_capabilities ENABLE ROW LEVEL SECURITY;

-- Everyone can view company capabilities reference
CREATE POLICY "Company capabilities ref are viewable by everyone"
  ON public.company_capabilities_ref
  FOR SELECT
  USING (true);

-- Only superadmins can modify the reference list
CREATE POLICY "Superadmins can insert company capabilities ref"
  ON public.company_capabilities_ref
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'superadmin'
    )
  );

CREATE POLICY "Superadmins can update company capabilities ref"
  ON public.company_capabilities_ref
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'superadmin'
    )
  );

CREATE POLICY "Superadmins can delete company capabilities ref"
  ON public.company_capabilities_ref
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'superadmin'
    )
  );

-- Users can view all company capabilities
CREATE POLICY "Company capabilities are viewable by everyone"
  ON public.company_capabilities
  FOR SELECT
  USING (true);

-- Users can manage their own company capabilities
CREATE POLICY "Users can insert their own company capabilities"
  ON public.company_capabilities
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies
      WHERE companies.id = company_capabilities.company_id
        AND companies.user_id = auth.uid()
    )
    OR
    -- Superadmins can insert capabilities for system companies (user_id IS NULL)
    (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'superadmin'
      )
      AND EXISTS (
        SELECT 1 FROM public.companies
        WHERE companies.id = company_capabilities.company_id
          AND companies.user_id IS NULL
      )
    )
  );

CREATE POLICY "Users can delete their own company capabilities"
  ON public.company_capabilities
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.companies
      WHERE companies.id = company_capabilities.company_id
        AND companies.user_id = auth.uid()
    )
    OR
    -- Superadmins can delete capabilities for system companies
    (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'superadmin'
      )
      AND EXISTS (
        SELECT 1 FROM public.companies
        WHERE companies.id = company_capabilities.company_id
          AND companies.user_id IS NULL
      )
    )
  );

-- Insert master list of company capabilities
INSERT INTO public.company_capabilities_ref (name, category) VALUES
  -- Agriculture & Forestry
  ('Field Crops', 'Agriculture & Forestry'),
  ('Cereals', 'Agriculture & Forestry'),
  ('Fruit', 'Agriculture & Forestry'),
  ('Root Crops', 'Agriculture & Forestry'),
  ('Forestry', 'Agriculture & Forestry'),
  ('Livestock Production', 'Agriculture & Forestry'),
  
  -- Assembly & Fabrication
  ('Adhesion', 'Assembly & Fabrication'),
  ('Assembly', 'Assembly & Fabrication'),
  ('Bottling', 'Assembly & Fabrication'),
  ('Fabrication (General)', 'Assembly & Fabrication'),
  ('Fabrication (Metal)', 'Assembly & Fabrication'),
  ('Fabrication (Plastic)', 'Assembly & Fabrication'),
  ('Kitting', 'Assembly & Fabrication'),
  
  -- Business Processes
  ('Administration', 'Business Processes'),
  ('E-commerce', 'Business Processes'),
  ('Financing', 'Business Processes'),
  ('Planning', 'Business Processes'),
  ('Project Management', 'Business Processes'),
  ('Shop Floor Control', 'Business Processes'),
  
  -- Casting, Moulding, Forming, & Forging
  ('Casting', 'Casting, Moulding, Forming, & Forging'),
  ('Closed Die Press Forging', 'Casting, Moulding, Forming, & Forging'),
  ('Compression Moulding', 'Casting, Moulding, Forming, & Forging'),
  ('Diecasting', 'Casting, Moulding, Forming, & Forging'),
  ('Drop Forging', 'Casting, Moulding, Forming, & Forging'),
  ('Forging', 'Casting, Moulding, Forming, & Forging'),
  ('Gas Injection Moulding', 'Casting, Moulding, Forming, & Forging'),
  ('Injection Moulding', 'Casting, Moulding, Forming, & Forging'),
  ('Insert Moulding / Encapsulation', 'Casting, Moulding, Forming, & Forging'),
  ('Moulding', 'Casting, Moulding, Forming, & Forging'),
  ('Plastic Extrusion', 'Casting, Moulding, Forming, & Forging'),
  ('Transfer Moulding', 'Casting, Moulding, Forming, & Forging'),
  ('Two shot moulding', 'Casting, Moulding, Forming, & Forging'),
  ('Upset Forging', 'Casting, Moulding, Forming, & Forging'),
  ('Vacuum Forming', 'Casting, Moulding, Forming, & Forging'),
  
  -- Construction
  ('Construction', 'Construction'),
  
  -- Craft and Trade Processes
  ('Carpentry and Woodworking', 'Craft and Trade Processes'),
  ('Food Technology', 'Craft and Trade Processes'),
  ('Leatherwork', 'Craft and Trade Processes'),
  ('Locksmithing', 'Craft and Trade Processes'),
  ('Manual Sewing Machining', 'Craft and Trade Processes'),
  ('Plumbing', 'Craft and Trade Processes'),
  ('Silversmithing', 'Craft and Trade Processes'),
  ('Upholstery & Trim', 'Craft and Trade Processes'),
  
  -- Design
  ('CAD / CAM', 'Design'),
  ('CAE/Simulation', 'Design'),
  ('CNC Programming', 'Design'),
  ('Design for EMC', 'Design'),
  ('Electrical or Electronic Design', 'Design'),
  ('Graphic Design', 'Design'),
  ('Mechanical Design', 'Design'),
  ('Programming', 'Design'),
  ('Reverse Engineering', 'Design'),
  ('Specification development', 'Design'),
  
  -- Electrical & Electronics
  ('Electrical & Electronics Assembly', 'Electrical & Electronics'),
  ('Embedded Processor Programming & Design', 'Electrical & Electronics'),
  ('FPGA implementation', 'Electrical & Electronics'),
  ('PCB Development', 'Electrical & Electronics'),
  ('Soldering', 'Electrical & Electronics'),
  ('Surface Mount Assembly', 'Electrical & Electronics'),
  ('Wiring Harnesses', 'Electrical & Electronics'),
  
  -- Eroding (EDM)
  ('CNC Eroding', 'Eroding (EDM)'),
  ('Spark Erosion', 'Eroding (EDM)'),
  ('Wire Erosion', 'Eroding (EDM)'),
  
  -- ICT Process
  ('Application Development', 'ICT Process'),
  ('Cabling Installation Service', 'ICT Process'),
  ('Data Conversion', 'ICT Process'),
  ('Data Warehousing', 'ICT Process'),
  ('Database Applications', 'ICT Process'),
  ('Disaster Recovery', 'ICT Process'),
  ('ICT Consultancy', 'ICT Process'),
  ('ICT Maintenance & Support', 'ICT Process'),
  ('Internet Services', 'ICT Process'),
  ('IP Surveillance - CCTV', 'ICT Process'),
  ('IT Networks', 'ICT Process'),
  ('Legacy Software Support', 'ICT Process'),
  ('Mobile Media & Services', 'ICT Process'),
  ('Multimedia Production', 'ICT Process'),
  ('Search Engine Marketing', 'ICT Process'),
  ('Software and System Design', 'ICT Process'),
  ('System Integration', 'ICT Process'),
  ('Telecoms Installation', 'ICT Process'),
  ('Testing (ICT systems)', 'ICT Process'),
  ('Unified messaging', 'ICT Process'),
  ('VoIP Network Installation', 'ICT Process'),
  ('Web Based Applications', 'ICT Process'),
  ('Web Hosting', 'ICT Process'),
  ('Wireless Networking', 'ICT Process'),
  
  -- Industrial Furnaces
  ('Electric Furnaces', 'Industrial Furnaces'),
  ('Stress Relieving Furnaces', 'Industrial Furnaces'),
  
  -- Machining
  ('Boring', 'Machining'),
  ('Broaching', 'Machining'),
  ('CNC Laser Cutting', 'Machining'),
  ('CNC Machining', 'Machining'),
  ('CNC Milling', 'Machining'),
  ('CNC Turning', 'Machining'),
  ('Cutting', 'Machining'),
  ('Drilling', 'Machining'),
  ('Fettling', 'Machining'),
  ('Gear Cutting', 'Machining'),
  ('Grinding', 'Machining'),
  ('Hobbing', 'Machining'),
  ('Manual Machining', 'Machining'),
  ('Milling', 'Machining'),
  ('Profiling', 'Machining'),
  ('Rotary transfer', 'Machining'),
  ('Sawing', 'Machining'),
  ('Splining', 'Machining'),
  ('Tapping', 'Machining'),
  ('Thread Grinding', 'Machining'),
  ('Threading', 'Machining'),
  ('Turning', 'Machining'),
  
  -- Metal Forming & Press-work
  ('Bending', 'Metal Forming & Press-work'),
  ('CNC Bending', 'Metal Forming & Press-work'),
  ('CNC Punching', 'Metal Forming & Press-work'),
  ('Cold Roll Forming', 'Metal Forming & Press-work'),
  ('Crushing', 'Metal Forming & Press-work'),
  ('Folding', 'Metal Forming & Press-work'),
  ('Metal Sheet Bending', 'Metal Forming & Press-work'),
  ('Metal Spinning', 'Metal Forming & Press-work'),
  ('Piercing', 'Metal Forming & Press-work'),
  ('Presswork', 'Metal Forming & Press-work'),
  ('Spring Winding', 'Metal Forming & Press-work'),
  ('Stamping', 'Metal Forming & Press-work'),
  ('Tube Bending', 'Metal Forming & Press-work'),
  ('Wire Forming', 'Metal Forming & Press-work'),
  
  -- Printing, Photography & Ink Stamps
  ('Digital Scanning', 'Printing, Photography & Ink Stamps'),
  ('Fine Art Printing', 'Printing, Photography & Ink Stamps'),
  ('Hot Foil Printing', 'Printing, Photography & Ink Stamps'),
  ('Image retouching/manipulation', 'Printing, Photography & Ink Stamps'),
  ('Photography', 'Printing, Photography & Ink Stamps'),
  ('Printing', 'Printing, Photography & Ink Stamps'),
  ('Screen Printing', 'Printing, Photography & Ink Stamps'),
  ('Shredding', 'Printing, Photography & Ink Stamps'),
  ('Silk Screen Printing', 'Printing, Photography & Ink Stamps'),
  ('Stamp cutting', 'Printing, Photography & Ink Stamps'),
  ('Type & Image Setting', 'Printing, Photography & Ink Stamps'),
  ('Video production/editing', 'Printing, Photography & Ink Stamps'),
  
  -- Prototyping
  ('Prototyping', 'Prototyping'),
  ('Rapid Prototyping', 'Prototyping'),
  
  -- Quality, Statistics & Measurement
  ('Calibration', 'Quality, Statistics & Measurement'),
  ('Certification & Approvals', 'Quality, Statistics & Measurement'),
  ('CMM', 'Quality, Statistics & Measurement'),
  ('Data Collection', 'Quality, Statistics & Measurement'),
  ('Measuring', 'Quality, Statistics & Measurement'),
  ('Quality Control', 'Quality, Statistics & Measurement'),
  
  -- Renewable Energy
  ('Biodiesel', 'Renewable Energy'),
  ('Biogas', 'Renewable Energy'),
  ('Biomass Energy', 'Renewable Energy'),
  ('Ethanol', 'Renewable Energy'),
  ('Hydro Power', 'Renewable Energy'),
  ('Solar Energy', 'Renewable Energy'),
  ('Wind Energy', 'Renewable Energy'),
  
  -- Renewable Materials
  ('Renewable material processing', 'Renewable Materials'),
  ('Renewable material production', 'Renewable Materials'),
  ('Renewable product development', 'Renewable Materials'),
  
  -- Research & Development
  ('Bioenergy', 'Research & Development'),
  ('Biological Science', 'Research & Development'),
  ('Healty & Wellbeing', 'Research & Development'),
  ('Laboratory Analysis', 'Research & Development'),
  ('Renewable & Novel Materials', 'Research & Development'),
  
  -- Services
  ('Archiving', 'Services'),
  ('Commissioning', 'Services'),
  ('Consultancy', 'Services'),
  ('Distribution Service', 'Services'),
  ('Installation', 'Services'),
  ('Kanban Service', 'Services'),
  ('Lobbying', 'Services'),
  ('Maintenance & Service', 'Services'),
  ('Marketing Consultancy', 'Services'),
  ('Mould Design service', 'Services'),
  ('Production-line Feed Service', 'Services'),
  ('Promotion', 'Services'),
  ('Publishing', 'Services'),
  ('Recruitment', 'Services'),
  ('Retail', 'Services'),
  ('Site Survey Service', 'Services'),
  ('Surveying Services', 'Services'),
  ('Training & Education', 'Services'),
  ('Translation', 'Services'),
  ('Waste Management', 'Services'),
  ('Waste recycling', 'Services'),
  
  -- Sintering
  ('Laser Sintering', 'Sintering'),
  
  -- Supply Chain
  ('Global Supply Management', 'Supply Chain'),
  ('Logistics & Warehousing', 'Supply Chain'),
  ('Material Handling & Packaging', 'Supply Chain'),
  ('Procurement', 'Supply Chain'),
  ('Supply Chain Management', 'Supply Chain'),
  
  -- Surface treatment & coating
  ('Annealing', 'Surface treatment & coating'),
  ('Anodising', 'Surface treatment & coating'),
  ('Blasting', 'Surface treatment & coating'),
  ('Braising', 'Surface treatment & coating'),
  ('Engraving', 'Surface treatment & coating'),
  ('Heat Treatment', 'Surface treatment & coating'),
  ('Paint formulation and mixing', 'Surface treatment & coating'),
  ('Painting', 'Surface treatment & coating'),
  ('Plating inc. electroplating & electroless plating', 'Surface treatment & coating'),
  ('Polishing', 'Surface treatment & coating'),
  ('Powder Coating', 'Surface treatment & coating'),
  ('Pre-treatment cleaning & chemical anti-corrosion', 'Surface treatment & coating'),
  ('Surfacing', 'Surface treatment & coating'),
  
  -- Tooling
  ('Progression Tooling', 'Tooling'),
  ('Tool Maintenance', 'Tooling'),
  ('Tool Making', 'Tooling'),
  ('Tool Manufacturing', 'Tooling'),
  
  -- Welding, brazing & soldering
  ('ARC welding', 'Welding, brazing & soldering'),
  ('Brazing', 'Welding, brazing & soldering'),
  ('CO2 Welding', 'Welding, brazing & soldering'),
  ('Gas welding', 'Welding, brazing & soldering'),
  ('Laser Welding', 'Welding, brazing & soldering'),
  ('MIG welding', 'Welding, brazing & soldering'),
  ('Projection welding', 'Welding, brazing & soldering'),
  ('Robotic Welding', 'Welding, brazing & soldering'),
  ('Soldering', 'Welding, brazing & soldering'),
  ('Spot welding', 'Welding, brazing & soldering'),
  ('TIG welding', 'Welding, brazing & soldering'),
  ('Ultrasonic Welding', 'Welding, brazing & soldering'),
  ('Welding', 'Welding, brazing & soldering')
ON CONFLICT (name) DO NOTHING;

