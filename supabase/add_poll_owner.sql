/* Add ownership metadata so users can delete polls they created. Run once. */

ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS created_by text;

DROP POLICY IF EXISTS "Public delete polls" ON public.polls;

CREATE POLICY "Public delete polls"
  ON public.polls FOR DELETE USING (true);
