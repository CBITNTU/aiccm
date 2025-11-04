-- Allow lead companies to delete their virtual organizations
CREATE POLICY "Lead companies can delete VOs"
ON virtual_organizations
FOR DELETE
USING (user_owns_company(auth.uid(), lead_company_id));

-- Also allow deletion of VO members when a VO is deleted
CREATE POLICY "Lead companies can delete VO members"
ON vo_members
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM virtual_organizations vo
    JOIN companies c ON vo.lead_company_id = c.id
    WHERE vo.id = vo_members.vo_id
    AND c.user_id = auth.uid()
  )
);