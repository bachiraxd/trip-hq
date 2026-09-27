/*
  # Create messages table for Trip Chat
  1. New Tables:
    - `messages`
      - `id` (uuid, primary key, default gen_random_uuid())
      - `sender_name` (text, not null)
      - `text` (text, not null)
      - `created_at` (timestamptz, default now())
  2. Security:
    - Enable RLS on `messages` table
    - Add public access policy for reading and inserting since it's a collaborative group trip app
  3. Realtime:
    - Add table to supabase_realtime publication
*/

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name text NOT NULL,
  text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on messages"
  ON messages FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on messages"
  ON messages FOR INSERT
  WITH CHECK (true);

-- Enable Realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
