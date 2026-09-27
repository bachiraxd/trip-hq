export type PageId = 'bus' | 'polls' | 'activities' | 'canvas' | 'moments';

export interface Seat {
  id: string;
  seat_label: string;
  occupant_name: string | null;
  claimed_by: string | null;
  group_id: string | null;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  sender_name: string;
  text: string;
  created_at: string;
}

export interface PresenceUser {
  id: string;
  name: string;
  color: string;
  page?: string;
}

export type GroupStatus = 'forming' | 'pending_vote' | 'confirmed' | 'cancelled';

export interface TripGroup {
  id: string;
  leader_id: string;
  leader_name: string;
  seat_type: 2 | 3;
  status: GroupStatus;
  seat_block: string | null;
  pending_seat_ids: string[] | null;
  created_at: string;
}

export interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string;
  member_name: string;
  is_leader: boolean;
  joined_at: string;
}

export interface SeatVote {
  id: string;
  group_id: string;
  voter_user_id: string;
  vote: 'yes' | 'no';
  created_at: string;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  created_by: string | null;
  created_at: string;
}

export interface PollVote {
  id: string;
  poll_id: string;
  voter_id: string;
  option_index: number;
  created_at: string;
}

export interface Activity {
  id: string;
  name: string;
  time_slot: string | null;
  max_spots: number | null;
  created_at: string;
}

export interface ActivitySignup {
  id: string;
  activity_id: string;
  user_id: string;
  user_name: string;
  created_at: string;
}

export interface CanvasStroke {
  id: string;
  user_id: string;
  color: string;
  points: { x: number; y: number }[];
  created_at: string;
}

export interface SnackEntry {
  id: string;
  user_id: string;
  user_name: string;
  snack: string;
  created_at: string;
}
