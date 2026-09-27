/* Add the sixth individual seat to the back bench. Run once in Supabase SQL Editor. */

INSERT INTO public.seats (id, seat_label)
VALUES ('G6', 'Back Row Seat 6')
ON CONFLICT (id) DO NOTHING;
