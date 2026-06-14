-- Replace legacy TED notice URLs with the current TED portal format.
--
-- Notices ingested via app/api/fetch-ted-tenders previously stored URLs of the
-- form `https://ted.europa.eu/udl?uri=TED:NOTICE:<id>`. That endpoint no longer
-- resolves on the new TED EU site, which broke the "View on TED (EU)" link on
-- the tender details screen. The current format is
-- `https://ted.europa.eu/en/notice/-/detail/<publication-number>`.
--
-- Older ingests sometimes used notice-identifier (UUID) in the legacy URL;
-- when reference_number holds a publication number (NNNNNN-YYYY), prefer that.

UPDATE public.tenders
SET documents = jsonb_set(
  documents,
  '{specification_url}',
  to_jsonb(
    'https://ted.europa.eu/en/notice/-/detail/' ||
    CASE
      WHEN reference_number ~ '^\d+-\d{4}$'
        AND regexp_replace(
          documents ->> 'specification_url',
          '^https?://ted\.europa\.eu/udl\?uri=TED:NOTICE:',
          ''
        ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN reference_number
      ELSE regexp_replace(
        documents ->> 'specification_url',
        '^https?://ted\.europa\.eu/udl\?uri=TED:NOTICE:',
        ''
      )
    END
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
    CASE
      WHEN reference_number ~ '^\d+-\d{4}$'
        AND regexp_replace(
          documents ->> 'application_url',
          '^https?://ted\.europa\.eu/udl\?uri=TED:NOTICE:',
          ''
        ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN reference_number
      ELSE regexp_replace(
        documents ->> 'application_url',
        '^https?://ted\.europa\.eu/udl\?uri=TED:NOTICE:',
        ''
      )
    END
  ),
  false
)
WHERE documents ? 'application_url'
  AND documents ->> 'application_url' LIKE 'http%://ted.europa.eu/udl?uri=TED:NOTICE:%';

-- Rows already migrated to detail/<uuid> but reference_number is a publication id.
UPDATE public.tenders
SET documents = jsonb_set(
  jsonb_set(
    documents,
    '{specification_url}',
    to_jsonb('https://ted.europa.eu/en/notice/-/detail/' || reference_number),
    false
  ),
  '{application_url}',
  to_jsonb('https://ted.europa.eu/en/notice/-/detail/' || reference_number),
  false
)
WHERE reference_number ~ '^\d+-\d{4}$'
  AND (
    documents ->> 'specification_url' LIKE 'http%://ted.europa.eu/en/notice/-/detail/%'
    OR documents ->> 'application_url' LIKE 'http%://ted.europa.eu/en/notice/-/detail/%'
  )
  AND documents ->> 'specification_url' NOT LIKE '%/notice/-/detail/' || reference_number;
