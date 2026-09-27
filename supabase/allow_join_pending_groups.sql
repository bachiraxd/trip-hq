/*
  Allow a user to join a group after its leader has proposed seats and voting
  has started. The new member is then included in the existing seat poll.

  Run this once in the Supabase SQL Editor after dynamic_groups_and_voting.sql.
*/

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

  SELECT * INTO v_group
  FROM public.groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND';
  END IF;

  IF v_group.status NOT IN ('forming', 'pending_vote') THEN
    RAISE EXCEPTION 'GROUP_NOT_OPEN';
  END IF;

  IF v_group.status = 'pending_vote'
     AND (v_group.pending_seat_ids IS NULL OR array_length(v_group.pending_seat_ids, 1) <> v_group.seat_type) THEN
    RAISE EXCEPTION 'GROUP_NOT_READY';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.group_members
  WHERE group_id = p_group_id;

  IF v_count >= v_group.seat_type THEN
    RAISE EXCEPTION 'GROUP_FULL';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, member_name, is_leader)
  VALUES (p_group_id, p_user_id, p_member_name, false);
END;
$$;

REVOKE ALL ON FUNCTION public.join_group(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_group(uuid, text, text) TO anon, authenticated;
