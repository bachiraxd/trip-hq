/*
  # Create seats table for Realtime Bus Seating
  1. New Tables:
    - `seats`
      - `id` (text, primary key) - e.g., '1A', '2B', 'G1'
      - `seat_label` (text, not null) - e.g., 'Row 1 Seat A'
      - `occupant_name` (text) - Name of the person claiming the seat
      - `claimed_by` (text) - Unique user ID from localStorage
      - `updated_at` (timestamptz) - Last updated timestamp
  2. Security:
    - Enable RLS on `seats` table
    - Add public access policy for reading and writing since it's a collaborative group trip app
  3. Realtime:
    - Add table to supabase_realtime publication
*/

CREATE TABLE IF NOT EXISTS seats (
  id text PRIMARY KEY,
  seat_label text NOT NULL,
  occupant_name text,
  claimed_by text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on seats"
  ON seats FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert/update/delete on seats"
  ON seats FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable Realtime for seats table
ALTER PUBLICATION supabase_realtime ADD TABLE seats;