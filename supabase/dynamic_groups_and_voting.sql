/*
  Dynamic Groups + Group Seat Voting
  ----------------------------------
  Replaces the old preset A-F groups system entirely.

  Rules encoded here:
  - Anyone can start a group and becomes its leader (one active group per person).
  - A group is size 2 or 3 (matches the bus's left pair / right trio columns).
  - Total seats committed across all non-cancelled groups cannot exceed 11.
    Creating a group that would push the total over 11 raises GROUP_LIMIT.
  - The leader proposes a specific seat block on the bus (must match group size
    and column side: 2-seater -> A/B pair, 3-seater -> C/D/E trio).
  - Non-leader members vote yes/no on the proposed block.
  - Approved if at least one member votes yes; rejected only if everyone votes no.
  - On approval, seats are assigned to all members atomically.
  - On rejection, the group resets to 'forming' so the leader can propose again.
  - Back row (G1-G5) is untouched by any of this - always individual claiming.

  Run this whole file once in the Supabase SQL Editor.
*/

-- 1. Drop the old static A-F groups system if it exists
DROP TABLE IF EXISTS group_members CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS seat_votes CASCADE;

-- 2. New groups table
CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id text NOT NULL,
  leader_name text NOT NULL,
  seat_type smallint NOT NULL CHECK (seat_type IN (2, 3)),
  status text NOT NULL DEFAULT 'forming' CHECK (status IN ('forming', 'pending_vote', 'confirmed', 'cancelled')),
  seat_block text,
  pending_seat_ids text[],
  created_at timestamptz DEFAULT now()
);

-- 3. Group members (one row per person, globally unique on user_id
--    so nobody can be in two groups at once)
CREATE TABLE group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id text NOT NULL UNIQUE,
  member_name text NOT NULL,
  is_leader boolean NOT NULL DEFAULT false,
  joined_at timestamptz DEFAULT now()
);

-- 4. Votes on a group's currently proposed seat block
CREATE TABLE seat_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  voter_user_id text NOT NULL,
  vote text NOT NULL CHECK (vote IN ('yes', 'no')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (group_id, voter_user_id)
);

-- 5. Tag seats with the group that claimed them (nullable - individual
--    claims leave this null)
ALTER TABLE seats ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE SET NULL;

-- 6. RLS: readable by everyone, writable only through the functions below
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read groups" ON groups FOR SELECT USING (true);
CREATE POLICY "Public read group_members" ON group_members FOR SELECT USING (true);
CREATE POLICY "Public read seat_votes" ON seat_votes FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE groups;
ALTER PUBLICATION supabase_realtime ADD TABLE group_members;
ALTER PUBLICATION supabase_realtime ADD TABLE seat_votes;

-- 7. create_group: atomic limit check + insert leader
CREATE OR REPLACE FUNCTION public.create_group(
  p_leader_id text,
  p_leader_name text,
  p_seat_type int
)
RETURNS public.groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum int;
  v_group public.groups;
BEGIN
  IF p_seat_type NOT IN (2, 3) THEN
    RAISE EXCEPTION 'INVALID_SEAT_TYPE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('groups-total-limit', 0));

  IF EXISTS (SELECT 1 FROM public.group_members WHERE user_id = p_leader_id) THEN
    RAISE EXCEPTION 'ALREADY_IN_GROUP';
  END IF;

  SELECT COALESCE(SUM(seat_type), 0) INTO v_sum
  FROM public.groups
  WHERE status <> 'cancelled';

  IF v_sum + p_seat_type > 11 THEN
    RAISE EXCEPTION 'GROUP_LIMIT';
  END IF;

  INSERT INTO public.groups (leader_id, leader_name, seat_type, status)
  VALUES (p_leader_id, p_leader_name, p_seat_type, 'forming')
  RETURNING * INTO v_group;

  INSERT INTO public.group_members (group_id, user_id, member_name, is_leader)
  VALUES (v_group.id, p_leader_id, p_leader_name, true);

  RETURN v_group;
END;
$$;

-- 8. join_group: capacity + open-status check
CREATE OR REPLACE FUNCTION public.join_group(
  p_group_id uuid,
  p_user_id text,
  p_member_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group public.groups;
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('group:' || p_group_id::text, 0));

  IF EXISTS (SELECT 1 FROM public.group_members WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'ALREADY_IN_GROUP';
  END IF;

  SELECT * INTO v_group FROM public.groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND';
  END IF;
  IF v_group.status <> 'forming' THEN
    RAISE EXCEPTION 'GROUP_NOT_OPEN';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.group_members WHERE group_id = p_group_id;
  IF v_count >= v_group.seat_type THEN
    RAISE EXCEPTION 'GROUP_FULL';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, member_name, is_leader)
  VALUES (p_group_id, p_user_id, p_member_name, false);
END;
$$;

-- 9. leave_group: leader leaving disbands the group and frees any seats;
--    a member leaving just removes their own membership
CREATE OR REPLACE FUNCTION public.leave_group(p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member public.group_members;
BEGIN
  SELECT * INTO v_member FROM public.group_members WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_member.is_leader THEN
    UPDATE public.seats
    SET occupant_name = NULL, claimed_by = NULL, group_id = NULL
    WHERE group_id = v_member.group_id;

    DELETE FROM public.groups WHERE id = v_member.group_id;
  ELSE
    DELETE FROM public.group_members WHERE id = v_member.id;
  END IF;
END;
$$;

-- 10. propose_group_seats: leader picks a specific seat block, opens voting
CREATE OR REPLACE FUNCTION public.propose_group_seats(
  p_group_id uuid,
  p_leader_id text,
  p_seat_block text,
  p_seat_ids text[]
)
RETURNS public.groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group public.groups;
  v_taken int;
  v_conflict int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('group:' || p_group_id::text, 0));

  SELECT * INTO v_group FROM public.groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND';
  END IF;
  IF v_group.leader_id <> p_leader_id THEN
    RAISE EXCEPTION 'NOT_LEADER';
  END IF;
  IF v_group.status <> 'forming' THEN
    RAISE EXCEPTION 'GROUP_NOT_READY';
  END IF;
  IF array_length(p_seat_ids, 1) <> v_group.seat_type THEN
    RAISE EXCEPTION 'SEAT_COUNT_MISMATCH';
  END IF;

  SELECT COUNT(*) INTO v_taken
  FROM public.seats
  WHERE id = ANY(p_seat_ids) AND claimed_by IS NOT NULL;
  IF v_taken > 0 THEN
    RAISE EXCEPTION 'SEAT_TAKEN';
  END IF;

  SELECT COUNT(*) INTO v_conflict
  FROM public.groups
  WHERE status = 'pending_vote' AND pending_seat_ids && p_seat_ids;
  IF v_conflict > 0 THEN
    RAISE EXCEPTION 'SEAT_TAKEN';
  END IF;

  DELETE FROM public.seat_votes WHERE group_id = p_group_id;

  UPDATE public.groups
  SET seat_block = p_seat_block, pending_seat_ids = p_seat_ids, status = 'pending_vote'
  WHERE id = p_group_id
  RETURNING * INTO v_group;

  RETURN v_group;
END;
$$;

-- 11. cast_group_vote: records a vote, auto-resolves once everyone's voted
CREATE OR REPLACE FUNCTION public.cast_group_vote(
  p_group_id uuid,
  p_voter_id text,
  p_vote text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group public.groups;
  v_is_leader boolean;
  v_needed int;
  v_received int;
  v_yes int;
  v_index int := 1;
  m record;
BEGIN
  IF p_vote NOT IN ('yes', 'no') THEN
    RAISE EXCEPTION 'INVALID_VOTE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('group:' || p_group_id::text, 0));

  SELECT * INTO v_group FROM public.groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND';
  END IF;
  IF v_group.status <> 'pending_vote' THEN
    RAISE EXCEPTION 'NO_ACTIVE_VOTE';
  END IF;

  SELECT is_leader INTO v_is_leader
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_voter_id;

  IF v_is_leader IS NULL THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;
  IF v_is_leader THEN
    RAISE EXCEPTION 'LEADER_CANNOT_VOTE';
  END IF;

  INSERT INTO public.seat_votes (group_id, voter_user_id, vote)
  VALUES (p_group_id, p_voter_id, p_vote)
  ON CONFLICT (group_id, voter_user_id) DO UPDATE SET vote = EXCLUDED.vote;

  SELECT COUNT(*) INTO v_needed FROM public.group_members WHERE group_id = p_group_id AND is_leader = false;
  SELECT COUNT(*) INTO v_received FROM public.seat_votes WHERE group_id = p_group_id;

  IF v_received < v_needed THEN
    RETURN jsonb_build_object('status', 'pending');
  END IF;

  SELECT COUNT(*) INTO v_yes FROM public.seat_votes WHERE group_id = p_group_id AND vote = 'yes';

  IF v_yes > 0 THEN
    FOR m IN
      SELECT user_id, member_name
      FROM public.group_members
      WHERE group_id = p_group_id
      ORDER BY is_leader DESC, joined_at ASC
    LOOP
      UPDATE public.seats
      SET occupant_name = m.member_name,
          claimed_by = m.user_id,
          group_id = p_group_id,
          updated_at = now()
      WHERE id = v_group.pending_seat_ids[v_index];
      v_index := v_index + 1;
    END LOOP;

    UPDATE public.groups SET status = 'confirmed' WHERE id = p_group_id;
    RETURN jsonb_build_object('status', 'confirmed');
  ELSE
    DELETE FROM public.seat_votes WHERE group_id = p_group_id;
    UPDATE public.groups
    SET status = 'forming', seat_block = NULL, pending_seat_ids = NULL
    WHERE id = p_group_id;
    RETURN jsonb_build_object('status', 'rejected');
  END IF;
END;
$$;

-- 12. Re-secure claim_bus_seat (individual claims) so it also refuses
--     any seat currently reserved by a group mid-vote
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
  v_reserved int;
BEGIN
  IF NULLIF(trim(p_seat_id), '') IS NULL
     OR NULLIF(trim(p_seat_label), '') IS NULL
     OR NULLIF(trim(p_occupant_name), '') IS NULL
     OR NULLIF(trim(p_claimed_by), '') IS NULL THEN
    RAISE EXCEPTION 'Seat claim is missing required data';
  END IF;

  IF EXISTS (SELECT 1 FROM public.group_members WHERE user_id = p_claimed_by) THEN
    RAISE EXCEPTION 'IN_GROUP_CANNOT_CLAIM_INDIVIDUALLY';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('seat:' || p_seat_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('user:' || p_claimed_by, 0));

  SELECT COUNT(*) INTO v_reserved
  FROM public.groups
  WHERE status = 'pending_vote' AND p_seat_id = ANY(pending_seat_ids);
  IF v_reserved > 0 THEN
    RAISE EXCEPTION 'Seat is already occupied';
  END IF;

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

  SELECT * INTO claimed_seat FROM public.seats WHERE id = p_seat_id;
  RETURN claimed_seat;
END;
$$;

-- 13. Grant execute to the anon role (no auth in this app)
REVOKE ALL ON FUNCTION public.create_group(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group(text, text, int) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.join_group(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_group(uuid, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.leave_group(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_group(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.propose_group_seats(uuid, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.propose_group_seats(uuid, text, text, text[]) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.cast_group_vote(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_group_vote(uuid, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.claim_bus_seat(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_bus_seat(text, text, text, text) TO anon, authenticated;
