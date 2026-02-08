-- Platform-wide settings (e.g. default AI model and reasoning effort).
-- Read/written by server only (service_role). Used for all AI requests when no override is provided.
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed defaults
INSERT INTO public.platform_settings (key, value) VALUES
  ('default_ai_model', 'gpt-5-nano'),
  ('default_reasoning_effort', 'default')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.platform_settings IS 'Key-value store for platform settings (e.g. default AI model). Server-only access.';
