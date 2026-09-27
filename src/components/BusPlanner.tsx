import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowRight,
  Bus,
  ChevronLeft,
  CircleUserRound,
  Shuffle,
  Wifi,
  WifiOff,
  Users,
  Crown,
  LogOut,
  MapPin,
} from 'lucide-react';
import { supabase, getUserId } from '../lib/supabase';
import { seatLayout } from '../lib/seatLayout';
import { PageId, Seat, TripGroup, GroupMemberRow, SeatVote } from '../types';
import { PapaErrorModal } from './PapaErrorModal';

interface BusPlannerProps {
  currentUserName: string;
  onSetName: (name: string) => void;
  onNavigate?: (page: PageId) => void;
}

const userId = getUserId();
const GROUP_SEAT_LIMIT = 11;

function nameForError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: string }).message);
  }
  return String(err);
}

export const BusPlanner: React.FC<BusPlannerProps> = ({ currentUserName, onSetName, onNavigate }) => {
  const [seats, setSeats] = useState<Record<string, Seat>>({});
  const [groups, setGroups] = useState<TripGroup[]>([]);
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [votes, setVotes] = useState<SeatVote[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [papaMessage, setPapaMessage] = useState<string | null>(null);
  const [pickingGroupId, setPickingGroupId] = useState<string | null>(null);
  const prevMyGroupStatus = useRef<string | null>(null);

  useEffect(() => {
    async function fetchAll() {
      const [seatsRes, groupsRes, membersRes, votesRes] = await Promise.all([
        supabase.from('seats').select('*'),
        supabase.from('groups').select('*'),
        supabase.from('group_members').select('*'),
        supabase.from('seat_votes').select('*'),
      ]);

      if (seatsRes.data) {
        const map: Record<string, Seat> = {};
        (seatsRes.data as Seat[]).forEach((row) => (map[row.id] = row));
        setSeats(map);
      }
      if (groupsRes.data) setGroups(groupsRes.data as TripGroup[]);
      if (membersRes.data) setMembers(membersRes.data as GroupMemberRow[]);
      if (votesRes.data) setVotes(votesRes.data as SeatVote[]);
      setLoading(false);
    }
    fetchAll();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('bus-planner-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seats' }, (payload) => {
        setSeats((prev) => {
          const next = { ...prev };
          if (payload.eventType === 'DELETE') delete next[(payload.old as Seat).id];
          else next[(payload.new as Seat).id] = payload.new as Seat;
          return next;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, (payload) => {
        setGroups((prev) => {
          if (payload.eventType === 'DELETE') {
            return prev.filter((g) => g.id !== (payload.old as TripGroup).id);
          }
          const row = payload.new as TripGroup;
          const withoutOld = prev.filter((g) => g.id !== row.id);
          return [...withoutOld, row];
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, (payload) => {
        setMembers((prev) => {
          if (payload.eventType === 'DELETE') {
            return prev.filter((m) => m.id !== (payload.old as GroupMemberRow).id);
          }
          const row = payload.new as GroupMemberRow;
          const withoutOld = prev.filter((m) => m.id !== row.id);
          return [...withoutOld, row];
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seat_votes' }, (payload) => {
        setVotes((prev) => {
          if (payload.eventType === 'DELETE') {
            return prev.filter((v) => v.id !== (payload.old as SeatVote).id);
          }
          const row = payload.new as SeatVote;
          const withoutOld = prev.filter((v) => v.id !== row.id);
          return [...withoutOld, row];
        });
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const myMembership = members.find((m) => m.user_id === userId);
  const myGroup = myMembership ? groups.find((g) => g.id === myMembership.group_id) : undefined;
  const isLeader = !!myMembership?.is_leader;

  useEffect(() => {
    const status = myGroup?.status ?? null;
    if (isLeader && prevMyGroupStatus.current === 'pending_vote' && status === 'forming') {
      setPapaMessage('beta yeh seat reject ho gayi, dusri try karo');
      setPickingGroupId(null);
    }
    prevMyGroupStatus.current = status;
  }, [myGroup?.status, isLeader]);

  const currentSeat = Object.values(seats).find((seat) => seat.claimed_by === userId);

  const totalCommittedSeats = groups
    .filter((g) => g.status !== 'cancelled')
    .reduce((sum, g) => sum + g.seat_type, 0);

  const openGroups = groups.filter(
    (g) =>
      (g.status === 'forming' || g.status === 'pending_vote') &&
      g.id !== myGroup?.id &&
      members.filter((m) => m.group_id === g.id).length < g.seat_type
  );

  const ensureName = (): string | null => {
    const name =
      currentUserName && currentUserName !== 'Guest' ? currentUserName : prompt('Enter your name first:');
    if (!name || !name.trim()) return null;
    if (!currentUserName || currentUserName === 'Guest') onSetName(name.trim());
    return name.trim();
  };

  const createGroup = useCallback(
    async (seatType: 2 | 3) => {
      if (myMembership) return;
      const name = ensureName();
      if (!name) return;

      setBusyKey('create-group');
      const { error } = await supabase.rpc('create_group', {
        p_leader_id: userId,
        p_leader_name: name,
        p_seat_type: seatType,
      });
      setBusyKey(null);

      if (error) {
        const msg = nameForError(error);
        if (msg.includes('GROUP_LIMIT')) {
          setPapaMessage('beta groups ki limit khatam itne bachhe bhi nahi hai');
        } else if (msg.includes('ALREADY_IN_GROUP')) {
          setPapaMessage('beta ek time pe ek hi group me reh sakte ho');
        } else {
          setPapaMessage('beta group nahi ban paya, dobara try karo');
        }
      }
    },
    [myMembership, currentUserName, onSetName]
  );

  const joinGroup = useCallback(
    async (groupId: string) => {
      if (myMembership) return;
      const name = ensureName();
      if (!name) return;

      setBusyKey(`join-${groupId}`);
      const { error } = await supabase.rpc('join_group', {
        p_group_id: groupId,
        p_user_id: userId,
        p_member_name: name,
      });
      setBusyKey(null);

      if (error) {
        const msg = nameForError(error);
        if (msg.includes('GROUP_FULL')) setPapaMessage('beta yeh group bhar chuka hai');
        else if (msg.includes('GROUP_NOT_OPEN')) setPapaMessage('beta yeh group ab khula nahi hai');
        else if (msg.includes('GROUP_NOT_READY')) setPapaMessage('beta leader ne abhi seat ready nahi ki');
        else if (msg.includes('ALREADY_IN_GROUP')) setPapaMessage('beta ek time pe ek hi group me reh sakte ho');
        else setPapaMessage('beta group join nahi ho paaya, dobara try karo');
      }
    },
    [myMembership, currentUserName, onSetName]
  );

  const leaveGroup = useCallback(async () => {
    setBusyKey('leave-group');
    const { error } = await supabase.rpc('leave_group', { p_user_id: userId });
    setBusyKey(null);
    setPickingGroupId(null);
    if (error) setPapaMessage('beta group chhod nahi paaye, dobara try karo');
  }, []);

  const proposeSeats = useCallback(async (groupId: string, seatBlock: string, seatIds: string[]) => {
    setBusyKey('propose-seats');
    const { error } = await supabase.rpc('propose_group_seats', {
      p_group_id: groupId,
      p_leader_id: userId,
      p_seat_block: seatBlock,
      p_seat_ids: seatIds,
    });
    setBusyKey(null);
    if (error) {
      const msg = nameForError(error);
      if (msg.includes('SEAT_TAKEN')) setPapaMessage('beta woh seat kisi aur ne le li, dusri chuno');
      else setPapaMessage('beta seat propose nahi ho payi, dobara try karo');
    } else {
      setPickingGroupId(null);
    }
  }, []);

  const castVote = useCallback(async (groupId: string, vote: 'yes' | 'no') => {
    setBusyKey(`vote-${groupId}`);
    const { error } = await supabase.rpc('cast_group_vote', {
      p_group_id: groupId,
      p_voter_id: userId,
      p_vote: vote,
    });
    setBusyKey(null);
    if (error) setPapaMessage('beta vote nahi ho paaya, dobara try karo');
  }, []);

  const claimSeat = useCallback(
    async (seatId: string, seatLabel: string) => {
      setClaimError(null);
      const existing = seats[seatId];

      if (existing?.claimed_by === userId) {
        setBusyKey(seatId);
        const { error } = await supabase.from('seats').delete().eq('id', seatId);
        setBusyKey(null);
        if (error) setClaimError('That seat could not be released. Please try again.');
        return;
      }

      if (existing?.claimed_by && existing.claimed_by !== userId) return;

      const name = ensureName();
      if (!name) return;

      setBusyKey(seatId);
      const { error } = await supabase.rpc('claim_bus_seat', {
        p_seat_id: seatId,
        p_seat_label: seatLabel,
        p_occupant_name: name,
        p_claimed_by: userId,
      });
      setBusyKey(null);
      if (error) {
        const msg = nameForError(error);
        if (msg.toLowerCase().includes('occupied')) {
          setClaimError('That seat was just taken. Please choose another seat.');
        } else if (msg.includes('IN_GROUP_CANNOT_CLAIM_INDIVIDUALLY')) {
          setPapaMessage('beta tum group me ho, apne leader ko seat chunne do');
        } else {
          setClaimError('That seat could not be claimed. Please try again.');
        }
      }
    },
    [seats, currentUserName, onSetName]
  );

  const handleSeatClick = (seatId: string, seatLabel: string, side: 'left' | 'right' | 'back') => {
    const seat = seats[seatId];

    if (seat?.group_id) return;

    if (side === 'back') {
      claimSeat(seatId, seatLabel);
      return;
    }

    if (pickingGroupId && myGroup && myGroup.id === pickingGroupId && isLeader) {
      const row = seatId.slice(0, -1);
      const letter = seatId.slice(-1);
      const wantsPair = myGroup.seat_type === 2;

      if (wantsPair && (letter === 'A' || letter === 'B')) {
        const ids = [`${row}A`, `${row}B`];
        if (ids.some((id) => seats[id]?.claimed_by)) {
          setPapaMessage('beta woh seat pehle se li ja chuki hai');
          return;
        }
        proposeSeats(myGroup.id, `Row ${row} · Seats A-B`, ids);
        return;
      }

      if (!wantsPair && ['C', 'D', 'E'].includes(letter)) {
        const ids = [`${row}C`, `${row}D`, `${row}E`];
        if (ids.some((id) => seats[id]?.claimed_by)) {
          setPapaMessage('beta woh seat pehle se li ja chuki hai');
          return;
        }
        proposeSeats(myGroup.id, `Row ${row} · Seats C-E`, ids);
        return;
      }

      setPapaMessage('beta yeh seat tumhare group ke size se match nahi karti');
      return;
    }

    if (myMembership) return;

    claimSeat(seatId, seatLabel);
  };

  const seatColor = (seatId: string, side: 'left' | 'right' | 'back') => {
    const seat = seats[seatId];
    if (seat?.group_id) {
      const pendingGroup = groups.find((g) => g.id === seat.group_id && g.status === 'pending_vote');
      if (pendingGroup) return 'bg-[#3a3560] border-[#5a52a8] text-[#c9c3ff] animate-pulse';
      return 'bg-gradient-to-br from-[#8e7cff] to-[#b27dff] hover:from-[#a194ff] hover:to-[#c394ff] border-[#c4b8ff] text-[#151b42]';
    }
    if (!seat?.claimed_by) {
      if (
        pickingGroupId &&
        myGroup &&
        ((myGroup.seat_type === 2 && side === 'left') || (myGroup.seat_type === 3 && side === 'right'))
      ) {
        return 'bg-[#2a5a8a] hover:bg-[#356ca3] border-[#5fa3d8] text-white ring-2 ring-[#5fa3d8]/60';
      }
      return 'bg-[#91a8c8] hover:bg-[#a8bdd9] border-[#b9cbe3] text-[#13213a]';
    }
    if (seat.claimed_by === userId) return 'bg-[#ffc84d] hover:bg-[#ffd66f] border-[#ffe29a] text-[#15233d]';
    return 'bg-gradient-to-br from-[#8e7cff] to-[#b27dff] hover:from-[#a194ff] hover:to-[#c394ff] border-[#c4b8ff] text-[#151b42]';
  };

  const SeatTile = ({ id, label, side }: { id: string; label: string; side: 'left' | 'right' | 'back' }) => {
    const seat = seats[id];
    const pending = seat?.group_id && groups.find((g) => g.id === seat.group_id && g.status === 'pending_vote');
    return (
      <button
        onClick={() => handleSeatClick(id, label, side)}
        disabled={busyKey !== null && busyKey !== id}
        className={`h-[42px] w-[42px] rounded-[9px] border shadow-[0_2px_6px_rgba(0,0,0,.25)] flex flex-col items-center justify-center text-[8px] font-semibold transition-all hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-80 sm:h-[52px] sm:w-[52px] ${seatColor(
          id,
          side
        )}`}
      >
        <span className="font-bold text-[9px]">{id}</span>
        {seat?.occupant_name ? (
          <span className="mt-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#172644]/80 text-[7px] text-white">
            {seat.occupant_name.slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <CircleUserRound className="mt-0.5 h-3.5 w-3.5 opacity-70" />
        )}
        <span className="mt-0.5 max-w-[44px] truncate px-0.5 text-[7px]">
          {pending ? 'Voting...' : seat?.occupant_name || 'Empty'}
        </span>
      </button>
    );
  };

  const rowNumbers = [1, 2, 3, 4, 5, 6, 7, 8];
  const backRow = seatLayout.filter((s) => s.side === 'back');
  const findSeat = (id: string) => seatLayout.find((s) => s.id === id)!;

  const pendingPopups = groups
    .filter((g) => g.status === 'pending_vote' && g.pending_seat_ids?.length)
    .map((g) => {
      const firstSeatId = g.pending_seat_ids![0];
      const rowNum = parseInt(firstSeatId, 10);
      const groupMembers = members.filter((m) => m.group_id === g.id);
      const groupVotes = votes.filter((v) => v.group_id === g.id);
      const nonLeaderCount = groupMembers.filter((m) => !m.is_leader).length;
      const yesCount = groupVotes.filter((v) => v.vote === 'yes').length;
      const noCount = groupVotes.filter((v) => v.vote === 'no').length;
      const iAmVoter = groupMembers.some((m) => m.user_id === userId && !m.is_leader);
      const iHaveVoted = groupVotes.some((v) => v.voter_user_id === userId);
      const side: 'left' | 'right' = g.seat_type === 2 ? 'left' : 'right';

      return { group: g, rowNum, nonLeaderCount, yesCount, noCount, iAmVoter, iHaveVoted, side };
    });

  // Keep the popup row anchor aligned with the first seat row below the driver.
  // The popup is positioned from the center of the bus stage so it stays
  // outside the bus frame instead of being pushed underneath the controls.
  const ROW_TOP_BASE = 72;
  const ROW_HEIGHT = 60;

  return (
    <div className="min-h-full overflow-x-hidden bg-[#061226] p-2 text-white sm:p-3 md:overflow-x-visible">
      <PapaErrorModal message={papaMessage} onClose={() => setPapaMessage(null)} />

      <section className="rounded-2xl border border-[#1e3b65] bg-[#07172d]/90 shadow-[0_18px_60px_rgba(0,0,0,.3)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1b355a] px-3 py-2 sm:px-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#4b51ff] to-[#7144e9] shadow-lg shadow-[#4b51ff]/30">
            <Bus size={21} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">Bus Seating & Groups</h2>
            <p className="text-[11px] text-[#adc1df] sm:text-xs">Start or join a group, then your leader picks the seats.</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#11284b] px-2 py-1.5 text-xs text-[#cfe0fb]">
            {connected ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-[#7890b3]" />}
            <span>{connected ? 'Live' : 'Connecting'}</span>
          </div>
        </div>

        <div className="grid gap-3 p-2 sm:p-3 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative z-20">
            <div className="relative overflow-hidden rounded-xl border border-[#1a3963] bg-[radial-gradient(circle_at_50%_35%,#102b52_0%,#07182f_48%,#041025_100%)] p-2 sm:p-3">
              <div className="pointer-events-none absolute left-2 top-20 hidden -rotate-12 text-sm font-semibold text-[#7d75ff] sm:block">
                <span className="block">2 seats</span><span>(left side)</span>
              </div>
              <div className="pointer-events-none absolute right-2 top-24 hidden rotate-12 text-sm font-semibold text-[#7d75ff] sm:block">
                <span className="block">3 seats</span><span>(right side)</span>
              </div>

              {loading ? (
                <div className="flex min-h-[520px] items-center justify-center text-sm text-[#a9bfdf]">Loading seats...</div>
              ) : (
                <div className="mx-auto w-fit max-w-full rounded-[28px] border-[5px] border-[#496887] bg-[#0b1c34] p-1 shadow-[0_0_0_3px_#172d4d,0_16px_40px_rgba(0,0,0,.6)] sm:p-2">
                  <div className="rounded-[21px] border border-[#254468] bg-[#0a1a31] p-2 sm:p-2.5">
                    <div className="mb-2 flex h-11 items-center justify-center rounded-lg border border-[#29476b] bg-[#0d203b] text-[9px] font-medium tracking-[.2em] text-[#94afd2] shadow-inner">
                      <span className="rounded-md border border-[#2c4b70] px-8 py-1.5">DRIVER</span>
                    </div>

                    <div className="space-y-1.5 sm:space-y-2">
                      {rowNumbers.map((row) => (
                        <div key={row} className="flex items-center justify-center gap-1.5 sm:gap-2.5">
                          <div className="flex gap-1 sm:gap-1.5">
                            <SeatTile id={`${row}A`} label={findSeat(`${row}A`).seat_label} side="left" />
                            <SeatTile id={`${row}B`} label={findSeat(`${row}B`).seat_label} side="left" />
                          </div>
                          <div className="w-2 text-center text-[6px] uppercase tracking-wider text-[#567294] sm:w-5 sm:text-[7px]">aisle</div>
                          <div className="flex gap-1 sm:gap-1.5">
                            <SeatTile id={`${row}C`} label={findSeat(`${row}C`).seat_label} side="right" />
                            <SeatTile id={`${row}D`} label={findSeat(`${row}D`).seat_label} side="right" />
                            <SeatTile id={`${row}E`} label={findSeat(`${row}E`).seat_label} side="right" />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 border-t border-[#29486b] pt-2">
                      <div className="flex justify-center gap-1 sm:gap-1.5">
                        {backRow.map((s) => (
                          <SeatTile key={s.id} id={s.id} label={s.seat_label} side="back" />
                        ))}
                      </div>
                      <div className="mt-1.5 text-center text-[8px] uppercase tracking-[.3em] text-[#6382aa]">
                        Back bench · individuals only
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-[#bed0e9] sm:gap-4 sm:text-xs">
                <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-full bg-[#91a8c8]" />Available</span>
                <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-full bg-[#9d7dff]" />Occupied</span>
                <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-full bg-[#ffc84d]" />You</span>
              </div>
            </div>

            {pendingPopups.map(({ group, rowNum, nonLeaderCount, yesCount, noCount, iAmVoter, iHaveVoted, side }) => (
              <div
                key={group.id}
                className={`absolute z-40 hidden w-52 max-w-[calc(100vw-1rem)] rounded-xl border border-[#6861ff] bg-[#12183a] p-3 shadow-2xl shadow-black/50 sm:block ${
                  side === 'left'
                    ? 'right-[calc(50%+170px)]'
                    : 'left-[calc(50%+170px)]'
                }`}
                style={{ top: ROW_TOP_BASE + (rowNum - 1) * ROW_HEIGHT }}
              >
                <span
                  className={`absolute top-4 h-3 w-3 rotate-45 border border-[#6861ff] bg-[#12183a] ${
                    side === 'left' ? '-right-1.5 border-l-0 border-b-0' : '-left-1.5 border-r-0 border-t-0'
                  }`}
                />
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#c9c3ff]">
                  <Users size={13} /> {group.leader_name}'s group
                </div>
                <p className="mt-1 text-[10px] text-[#9aa8d8]">Voting on {group.seat_block}</p>
                <p className="mt-1 text-[10px] text-[#7c8bc0]">
                  {yesCount} yes · {noCount} no · {nonLeaderCount - yesCount - noCount} waiting
                </p>
                {iAmVoter && !iHaveVoted && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => castVote(group.id, 'yes')}
                      className="flex-1 rounded-lg bg-emerald-500/90 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-400"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => castVote(group.id, 'no')}
                      className="flex-1 rounded-lg bg-rose-500/90 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-rose-400"
                    >
                      No
                    </button>
                  </div>
                )}
                {iAmVoter && iHaveVoted && (
                  <p className="mt-2 text-[10px] font-medium text-emerald-300">Vote recorded ✓</p>
                )}
              </div>
            ))}
          </div>

          <aside className="contents">
            <div className="flex flex-col gap-3 xl:col-start-2 xl:row-start-2">
              <div className="rounded-xl border border-[#214268] bg-[#091a32] p-3">
              <h3 className="mb-3 text-xs font-semibold">Seat Legend</h3>
              <div className="space-y-2 text-[11px] text-[#b4c8e5]">
                <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#91a8c8]" />Available</span>
                <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#9d7dff]" />Occupied</span>
                <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#ffc84d]" />Your seat</span>
              </div>
              </div>

              <div className="rounded-xl border border-[#214268] bg-[#091a32] p-3">
              <div className="mb-2 text-[11px] font-semibold text-[#cbdaf0]">Your Seat</div>
              <div className="flex items-center gap-2 text-xs text-white">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ffc84d]" />
                {currentSeat ? currentSeat.id : 'Not selected'}
              </div>
              {currentSeat && <div className="mt-1 pl-4 text-[10px] text-[#8fa9ca]">{currentSeat.seat_label}</div>}
              <button
                type="button"
                disabled={!currentSeat || !!myMembership}
                onClick={() => currentSeat && claimSeat(currentSeat.id, currentSeat.seat_label)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#31557f] bg-[#122b50] px-2 py-1.5 text-[11px] font-semibold text-[#d6e5fa] hover:bg-[#1b3b68] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Shuffle size={14} /> Change Seat
              </button>
              </div>
            </div>

            <div className="relative z-30 order-first rounded-xl border border-[#214268] bg-[#091a32] p-3 xl:col-span-2">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#cbdaf0]">
                <Users size={14} /> Groups
                <span className="ml-auto text-[10px] font-normal text-[#7c8bc0]">
                  {totalCommittedSeats}/{GROUP_SEAT_LIMIT} seats used
                </span>
              </div>

              {!myMembership ? (
                <>
                  <p className="mb-2 text-[10px] text-[#8fa9ca]">Start a group and pick 2 or 3 seats together.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyKey === 'create-group'}
                      onClick={() => createGroup(2)}
                      className="flex-1 rounded-lg bg-gradient-to-r from-[#7654ff] to-[#5d45f1] px-2 py-1.5 text-[11px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
                    >
                      2-seater
                    </button>
                    <button
                      type="button"
                      disabled={busyKey === 'create-group'}
                      onClick={() => createGroup(3)}
                      className="flex-1 rounded-lg bg-gradient-to-r from-[#7654ff] to-[#5d45f1] px-2 py-1.5 text-[11px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
                    >
                      3-seater
                    </button>
                  </div>

                  {openGroups.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-[#243e62] pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7c8bc0]">Open groups</p>
                      {openGroups.map((g) => {
                        const count = members.filter((m) => m.group_id === g.id).length;
                        return (
                          <div key={g.id} className="flex items-center justify-between rounded-lg bg-[#0d2343] px-2 py-1.5 text-[11px]">
                            <span className="truncate text-[#d6e5fa]">
                              {g.leader_name} ({g.seat_type}-seater · {count}/{g.seat_type})
                            </span>
                            <button
                              type="button"
                              disabled={busyKey === `join-${g.id}`}
                              onClick={() => joinGroup(g.id)}
                              className="ml-2 shrink-0 rounded-md bg-[#31557f] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#3f6a9c] disabled:opacity-50"
                            >
                              {g.status === 'pending_vote' ? 'Join & vote' : 'Join'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#d6e5fa]">
                    {isLeader && <Crown size={12} className="text-amber-400" />}
                    {myGroup?.leader_name}'s group ({myGroup?.seat_type}-seater)
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {members
                      .filter((m) => m.group_id === myGroup?.id)
                      .map((m) => (
                        <span key={m.id} className="rounded-full bg-[#122b50] px-2 py-1 text-[10px] text-[#d6e5fa]">
                          {m.is_leader && '👑 '}
                          {m.member_name}
                        </span>
                      ))}
                  </div>

                  {isLeader && myGroup?.status === 'forming' && (
                    <button
                      type="button"
                      onClick={() => setPickingGroupId(pickingGroupId ? null : myGroup!.id)}
                      className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                        pickingGroupId
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                          : 'bg-gradient-to-r from-[#7654ff] to-[#5d45f1] text-white hover:brightness-110'
                      }`}
                    >
                      <MapPin size={13} />
                      {pickingGroupId ? 'Tap a highlighted seat...' : 'Pick Seats on Bus'}
                    </button>
                  )}

                  {myGroup?.status === 'pending_vote' && (
                    <p className="mt-3 text-[10px] text-[#8fa9ca]">Waiting on the group's vote for {myGroup.seat_block}...</p>
                  )}

                  {myGroup?.status === 'confirmed' && (
                    <p className="mt-3 text-[10px] font-medium text-emerald-300">Seats confirmed at {myGroup.seat_block} ✓</p>
                  )}

                  <button
                    type="button"
                    onClick={leaveGroup}
                    disabled={busyKey === 'leave-group'}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/10 px-2 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    <LogOut size={13} /> {isLeader ? 'Disband Group' : 'Leave Group'}
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>

        {claimError && <p className="border-t border-[#592e58] bg-[#311d3b] px-4 py-2 text-xs text-rose-300">{claimError}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1b355a] px-3 py-2.5 sm:px-4">
          <button type="button" disabled className="flex items-center gap-1.5 rounded-lg border border-[#284a73] bg-[#0d2343] px-3 py-1.5 text-xs text-[#b8cce7] opacity-60">
            <ChevronLeft size={15} /> Previous
          </button>
          <span className="text-xs text-[#819abd]">Page 1 · Bus Seating & Groups</span>
          <button type="button" onClick={() => onNavigate?.('polls')} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#7654ff] to-[#5d45f1] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[#614bf1]/20 hover:brightness-110">
            Next (Polls) <ArrowRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
};
