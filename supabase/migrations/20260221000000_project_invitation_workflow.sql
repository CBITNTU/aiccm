-- Project invitation workflow: add invitation tracking columns to vo_members

-- Add invitation columns
ALTER TABLE public.vo_members
  ADD COLUMN IF NOT EXISTS invitation_status TEXT
    CHECK (invitation_status IN ('pending', 'sent', 'accepted', 'rejected')),
  ADD COLUMN IF NOT EXISTS invitation_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invitation_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invitation_message TEXT;

-- Unique index on invitation_token (only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vo_members_invitation_token
  ON public.vo_members (invitation_token)
  WHERE invitation_token IS NOT NULL;

-- Backfill: set invitation_status = 'pending' for existing invited members
UPDATE public.vo_members
  SET invitation_status = 'pending'
  WHERE role = 'invited' AND invitation_status IS NULL;

-- RLS: allow invited companies (invitation_status = 'sent') to view the project
CREATE POLICY "Invited companies can view projects"
  ON public.virtual_organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vo_members
      WHERE vo_members.vo_id = virtual_organizations.id
        AND vo_members.invitation_status IN ('sent', 'accepted')
        AND vo_members.company_id IN (
          SELECT c.id FROM public.companies c
          LEFT JOIN public.company_members cm ON cm.company_id = c.id AND cm.status = 'approved'
          WHERE c.user_id = auth.uid() OR cm.user_id = auth.uid()
        )
    )
  );

-- RLS: allow invited companies to view vo_members for projects they're invited to
CREATE POLICY "Invited companies can view project members"
  ON public.vo_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vo_members my_membership
      WHERE my_membership.vo_id = vo_members.vo_id
        AND my_membership.invitation_status IN ('sent', 'accepted')
        AND my_membership.company_id IN (
          SELECT c.id FROM public.companies c
          LEFT JOIN public.company_members cm ON cm.company_id = c.id AND cm.status = 'approved'
          WHERE c.user_id = auth.uid() OR cm.user_id = auth.uid()
        )
    )
  );
