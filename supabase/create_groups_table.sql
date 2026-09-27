/*
  # Create groups + group_members tables
  1. New Tables:
    - `groups` (id, name, color) - predefined group cards
    - `group_members` (id, group_id, user_id, member_name) - who joined which group
  2. Security: public read/write policies (no auth, trip app)
  3. Realtime: enabled on group_members so joins/leaves sync live
  4. Seeds: inserts 6 default groups (A-F) if they don't already exist
*/

CREATE TABLE IF NOT EXISTS groups (
  id text PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#9E7FFF'
);

CREATE TABLE IF NOT EXISTS group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  member_name text NOT NULL,
  joined_at timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on groups"
  ON groups FOR SELECT USING (true);

CREATE POLICY "Allow public read on group_members"
  ON group_members FOR SELECT USING (true);

CREATE POLICY "Allow public insert on group_members"
  ON group_members FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on group_members"
  ON group_members FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow public delete on group_members"
  ON group_members FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE group_members;

INSERT INTO groups (id, name, color) VALUES
  ('A', 'Group A', '#9E7FFF'),
  ('B', 'Group B', '#38bdf8'),
  ('C', 'Group C', '#f472b6'),
  ('D', 'Group D', '#fb923c'),
  ('E', 'Group E', '#4ade80'),
  ('F', 'Group F', '#facc15')
ON CONFLICT (id) DO NOTHING;
