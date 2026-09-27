/*
  Simple working models for Polls, Activities, and Canvas.
  These are intentionally basic (no admin locks, anyone can create/vote/join/draw) -
  meant to be customized later.
*/

-- ===== POLLS =====
CREATE TABLE IF NOT EXISTS polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  options jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  voter_id text NOT NULL,
  option_index int NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (poll_id, voter_id)
);

ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read polls" ON polls FOR SELECT USING (true);
CREATE POLICY "Public insert polls" ON polls FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read poll_votes" ON poll_votes FOR SELECT USING (true);
CREATE POLICY "Public insert poll_votes" ON poll_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update poll_votes" ON poll_votes FOR UPDATE USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE polls;
ALTER PUBLICATION supabase_realtime ADD TABLE poll_votes;

-- ===== ACTIVITIES =====
CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  time_slot text,
  max_spots int,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  user_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (activity_id, user_id)
);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read activities" ON activities FOR SELECT USING (true);
CREATE POLICY "Public insert activities" ON activities FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read activity_signups" ON activity_signups FOR SELECT USING (true);
CREATE POLICY "Public insert activity_signups" ON activity_signups FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete activity_signups" ON activity_signups FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE activities;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_signups;

INSERT INTO activities (name, time_slot, max_spots) VALUES
  ('Water Park', '10:00 AM - 1:00 PM', 30),
  ('Museum Tour', '10:00 AM - 12:00 PM', 20),
  ('Free Roam Market', '2:00 PM - 4:00 PM', 30),
  ('Bonfire Night', '8:00 PM - 10:00 PM', 30)
ON CONFLICT DO NOTHING;

-- ===== CANVAS =====
CREATE TABLE IF NOT EXISTS canvas_strokes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  color text NOT NULL,
  points jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE canvas_strokes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read canvas_strokes" ON canvas_strokes FOR SELECT USING (true);
CREATE POLICY "Public insert canvas_strokes" ON canvas_strokes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete canvas_strokes" ON canvas_strokes FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE canvas_strokes;
