/*
  Enforce one active bus seat per browser identity and make seat changes atomic.

  The cleanup keeps the most recently updated row for each user. Run this file
  once in the Supabase SQL editor before deploying the updated frontend.
*/

WITH ranked_duplicates AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY claimed_by
      ORDER BY updated_at DESC NULLS LAST, id DESC
    ) AS row_rank
  FROM public.seats
  WHERE claimed_by IS NOT NULL
), duplicates_to_remove AS (
  SELECT id
  FROM ranked_duplicates
  WHERE row_rank > 1
)
DELETE FROM public.seats
WHERE id IN (SELECT id FROM duplicates_to_remove);

CREATE UNIQUE INDEX IF NOT EXISTS seats_one_seat_per_user_idx
  ON public.seats (claimed_by)
  WHERE claimed_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_bus_seat(
  p_seat_id text,
  p_seat_label text,
  p_occupant_name text,
  p_claimed_by text
)
RETURNS public.seats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_seat public.seats;
BEGIN
  IF NULLIF(trim(p_seat_id), '') IS NULL
     OR NULLIF(trim(p_seat_label), '') IS NULL
     OR NULLIF(trim(p_occupant_name), '') IS NULL
     OR NULLIF(trim(p_claimed_by), '') IS NULL THEN
    RAISE EXCEPTION 'Seat claim is missing required data';
  END IF;

  -- Serialize claims for the same seat and the same user, including tabs.
  PERFORM pg_advisory_xact_lock(hashtextextended('seat:' || p_seat_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('user:' || p_claimed_by, 0));

  SELECT * INTO claimed_seat
  FROM public.seats
  WHERE id = p_seat_id
  FOR UPDATE;

  IF claimed_seat.claimed_by IS NOT NULL
     AND claimed_seat.claimed_by <> p_claimed_by THEN
    RAISE EXCEPTION 'Seat is already occupied';
  END IF;

  DELETE FROM public.seats
  WHERE claimed_by = p_claimed_by
    AND id <> p_seat_id;

  INSERT INTO public.seats (id, seat_label, occupant_name, claimed_by, updated_at)
  VALUES (p_seat_id, p_seat_label, p_occupant_name, p_claimed_by, now())
  ON CONFLICT (id) DO UPDATE SET
    seat_label = EXCLUDED.seat_label,
    occupant_name = EXCLUDED.occupant_name,
    claimed_by = EXCLUDED.claimed_by,
    updated_at = EXCLUDED.updated_at;

  SELECT * INTO claimed_seat
  FROM public.seats
  WHERE id = p_seat_id;

  RETURN claimed_seat;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_bus_seat(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_bus_seat(text, text, text, text) TO anon, authenticated;
