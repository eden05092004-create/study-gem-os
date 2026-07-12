-- Extend questions to support multiple formats
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'mcq',
  ADD COLUMN IF NOT EXISTS blanks jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.questions ALTER COLUMN correct_index DROP NOT NULL;
ALTER TABLE public.questions ALTER COLUMN options SET DEFAULT '[]'::jsonb;
ALTER TABLE public.questions ALTER COLUMN explanations SET DEFAULT '[]'::jsonb;

-- Store answers per blank
ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS blank_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS chosen_value text;
ALTER TABLE public.answers ALTER COLUMN chosen_index DROP NOT NULL;

-- Store mistakes per blank
ALTER TABLE public.mistakes
  ADD COLUMN IF NOT EXISTS blank_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS chosen_value text,
  ADD COLUMN IF NOT EXISTS correct_value text,
  ADD COLUMN IF NOT EXISTS blank_label text,
  ADD COLUMN IF NOT EXISTS question_text text;
ALTER TABLE public.mistakes ALTER COLUMN chosen_index DROP NOT NULL;

ALTER TABLE public.mistakes DROP CONSTRAINT IF EXISTS mistakes_user_id_question_id_key;
ALTER TABLE public.mistakes
  ADD CONSTRAINT mistakes_user_id_question_id_blank_id_key UNIQUE (user_id, question_id, blank_id);