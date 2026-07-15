CREATE TABLE public.lecture_tutor_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.files ON DELETE CASCADE,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_section INTEGER NOT NULL DEFAULT 0,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  recap JSONB,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, file_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_tutor_sessions TO authenticated;
GRANT ALL ON public.lecture_tutor_sessions TO service_role;

ALTER TABLE public.lecture_tutor_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tutor sessions" ON public.lecture_tutor_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_lecture_tutor_sessions_updated_at
  BEFORE UPDATE ON public.lecture_tutor_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
