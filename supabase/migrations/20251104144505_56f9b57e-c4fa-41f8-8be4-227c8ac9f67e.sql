-- Add analysis and recommendation columns to virtual_organizations table
ALTER TABLE virtual_organizations
ADD COLUMN IF NOT EXISTS gap_analysis jsonb,
ADD COLUMN IF NOT EXISTS team_analysis jsonb,
ADD COLUMN IF NOT EXISTS recommended_partners jsonb;