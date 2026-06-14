-- Replace legacy TED notice URLs with the current TED portal format.
-- Data-only migration (no schema change). Safe to skip if zero legacy TED rows.
--
-- See docs/ted-notice-links.md

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
--> statement-breakpoint

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
--> statement-breakpoint

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
