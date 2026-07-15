-- Materials storage bucket: real file bytes for uploaded PDFs/docs, so AI generation
-- can be grounded in actual content instead of just filenames.
INSERT INTO storage.buckets (id, name, public) VALUES ('materials', 'materials', false);

-- Path convention: {user_id}/{topic_id}/{file_id}-{filename} — owner-only access.
CREATE POLICY "Users manage own material files" ON storage.objects
  FOR ALL
  USING (bucket_id = 'materials' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'materials' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Files: link to the actual stored object, and to a lecture for finer-grained
-- material selection (previously only linked to a topic).
ALTER TABLE public.files
  ADD COLUMN storage_path TEXT,
  ADD COLUMN mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  ADD COLUMN lecture_id UUID REFERENCES public.lectures(id) ON DELETE SET NULL;
