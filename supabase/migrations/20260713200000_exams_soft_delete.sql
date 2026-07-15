-- Soft delete for exams: deleting moves an exam to Trash (deleted_at set) instead
-- of immediately destroying it. Client purges anything older than 30 days on load.
ALTER TABLE public.exams
  ADD COLUMN deleted_at TIMESTAMPTZ;
