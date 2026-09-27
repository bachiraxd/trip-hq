/* Shared snacks list for the trip. Run once in the Supabase SQL editor. */

CREATE TABLE IF NOT EXISTS public.snack_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_name text NOT NULL,
  snack text NOT NULL CHECK (char_length(btrim(snack)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.snack_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read snacks" ON public.snack_entries;
DROP POLICY IF EXISTS "Anyone can add snacks" ON public.snack_entries;
DROP POLICY IF EXISTS "Users can delete their own snacks" ON public.snack_entries;

CREATE POLICY "Anyone can read snacks"
  ON public.snack_entries FOR SELECT USING (true);

CREATE POLICY "Anyone can add snacks"
  ON public.snack_entries FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete their own snacks"
  ON public.snack_entries FOR DELETE USING (true);

ALTER TABLE public.snack_entries REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'snack_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.snack_entries;
  END IF;
END $$;
