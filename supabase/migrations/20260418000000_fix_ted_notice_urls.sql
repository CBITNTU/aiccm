-- Replace legacy TED notice URLs with the current TED portal format.
--
-- Notices ingested via app/api/fetch-ted-tenders previously stored URLs of the
-- form `https://ted.europa.eu/udl?uri=TED:NOTICE:<id>`. That endpoint no longer
-- resolves on the new TED EU site, which broke the "View on TED (EU)" link on
-- the tender details screen. The current format is
-- `https://ted.europa.eu/en/notice/-/detail/<id>`.
--
-- This migration rewrites both `documents.specification_url` and
-- `documents.application_url` for any tender that still holds the legacy URL.

UPDATE public.tenders
SET documents = jsonb_set(
  documents,
  '{specification_url}',
  to_jsonb(
    'https://ted.europa.eu/en/notice/-/detail/' ||
    regexp_replace(
      documents ->> 'specification_url',
      '^https?://ted\.europa\.eu/udl\?uri=TED:NOTICE:',
      ''
    )
  ),
  false
)
WHERE documents ? 'specification_url'
  AND documents ->> 'specification_url' LIKE 'http%://ted.europa.eu/udl?uri=TED:NOTICE:%';

UPDATE public.tenders
SET documents = jsonb_set(
  documents,
  '{application_url}',
  to_jsonb(
    'https://ted.europa.eu/en/notice/-/detail/' ||
    regexp_replace(
      documents ->> 'application_url',
      '^https?://ted\.europa\.eu/udl\?uri=TED:NOTICE:',
      ''
    )
  ),
  false
)
WHERE documents ? 'application_url'
  AND documents ->> 'application_url' LIKE 'http%://ted.europa.eu/udl?uri=TED:NOTICE:%';
