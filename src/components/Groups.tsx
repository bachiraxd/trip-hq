import React, { useEffect, useState, useCallback } from 'react';
import { Users, Wifi, WifiOff, ArrowRight, ArrowLeft, LogOut } from 'lucide-react';
import { supabase, getUserId } from '../lib/supabase';
import { Group, GroupMember, PageId } from '../types';

interface GroupsProps {
  currentUserName: string;
  onSetName: (name: string) => void;
  onNavigate?: (page: PageId) => void;
}

const userId = getUserId();

export const Groups: React.FC<GroupsProps> = ({ currentUserName, onSetName, onNavigate }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      const [groupsRes, membersRes] = await Promise.all([
        supabase.from('groups').select('*').order('id'),
        supabase.from('group_members').select('*'),
      ]);
      if (groupsRes.error) console.error('Failed to fetch groups:', groupsRes.error.message);
      else if (groupsRes.data) setGroups(groupsRes.data as Group[]);

      if (membersRes.error) console.error('Failed to fetch members:', membersRes.error.message);
      else if (membersRes.data) setMembers(membersRes.data as GroupMember[]);

      setLoading(false);
    }
    fetchData();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('group-members-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members' },
        (payload) => {
          setMembers((prev) => {
            if (payload.eventType === 'DELETE') {
              return prev.filter((m) => m.id !== (payload.old as GroupMember).id);
            }
            const row = payload.new as GroupMember;
            const withoutOld = prev.filter((m) => m.id !== row.id && m.user_id !== row.user_id);
            return [...withoutOld, row];
          });
        }
      )
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const myMembership = members.find((m) => m.user_id === userId);

  const joinGroup = useCallback(
    async (groupId: string) => {
      setError(null);

      const name = currentUserName && currentUserName !== 'Guest'
        ? currentUserName
        : prompt('Enter your name to join this group:');
      if (!name || !name.trim()) return;

      if (!currentUserName || currentUserName === 'Guest') {
        onSetName(name.trim());
      }

      setBusyGroupId(groupId);
      const { error: upsertError } = await supabase
        .from('group_members')
        .upsert(
          { group_id: groupId, user_id: userId, member_name: name.trim() },
          { onConflict: 'user_id' }
        );
      setBusyGroupId(null);

      if (upsertError) {
        console.error('Failed to join group:', upsertError.message);
        setError('Could not join that group. Please try again.');
      }
    },
    [currentUserName, onSetName]
  );

  const leaveGroup = useCallback(async () => {
    if (!myMembership) return;
    setBusyGroupId(myMembership.group_id);
    const { error: deleteError } = await supabase
      .from('group_members')
      .delete()
      .eq('user_id', userId);
    setBusyGroupId(null);
    if (deleteError) {
      console.error('Failed to leave group:', deleteError.message);
      setError('Could not leave the group. Please try again.');
    }
  }, [myMembership]);

  const membersFor = (groupId: string) => members.filter((m) => m.group_id === groupId);

  return (
    <div className="min-h-full bg-[#061226] p-2 text-white sm:p-3">
      <section className="rounded-2xl border border-[#1e3b65] bg-[#07172d]/90 shadow-[0_18px_60px_rgba(0,0,0,.3)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1b355a] px-3 py-2 sm:px-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#4b51ff] to-[#7144e9] shadow-lg shadow-[#4b51ff]/30">
            <Users size={21} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">Groups</h2>
            <p className="text-[11px] text-[#adc1df] sm:text-xs">Pick a group to team up with for the trip.</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#11284b] px-2 py-1.5 text-xs text-[#cfe0fb]">
            {connected ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-[#7890b3]" />}
            <span>{connected ? 'Live' : 'Connecting'}</span>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <p className="text-sm text-[#a9bfdf]">Loading groups...</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => {
                const groupMembers = membersFor(group.id);
                const isMine = myMembership?.group_id === group.id;
                const isBusy = busyGroupId === group.id;

                return (
                  <div
                    key={group.id}
                    className={`rounded-xl border p-3 transition ${
                      isMine
                        ? 'border-[#6861ff] bg-gradient-to-br from-[#1c2570] to-[#241a5e]'
                        : 'border-[#1e3b65] bg-[#091a32]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: group.color }}
                      />
                      <h3 className="text-sm font-semibold">{group.name}</h3>
                      <span className="ml-auto text-[11px] text-[#8fa9ca]">
                        {groupMembers.length} joined
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 min-h-[28px]">
                      {groupMembers.length === 0 ? (
                        <span className="text-[11px] text-[#6382aa]">No one yet</span>
                      ) : (
                        groupMembers.map((m) => (
                          <span
                            key={m.id}
                            className="rounded-full bg-[#122b50] px-2 py-1 text-[11px] text-[#d6e5fa]"
                          >
                            {m.member_name}
                          </span>
                        ))
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isBusy || (!!myMembership && !isMine)}
                      onClick={() => (isMine ? leaveGroup() : joinGroup(group.id))}
                      className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        isMine
                          ? 'border border-rose-400/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                          : 'bg-gradient-to-r from-[#7654ff] to-[#5d45f1] text-white hover:brightness-110'
                      }`}
                    >
                      {isMine ? (
                        <>
                          <LogOut size={14} /> Leave Group
                        </>
                      ) : (
                        'Join Group'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <p className="border-t border-[#592e58] bg-[#311d3b] px-4 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1b355a] px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={() => onNavigate?.('polls')}
            className="flex items-center gap-1.5 rounded-lg border border-[#284a73] bg-[#0d2343] px-3 py-1.5 text-xs text-[#b8cce7] hover:bg-[#1c3a66]"
          >
            <ArrowLeft size={15} /> Previous
          </button>
          <span className="text-xs text-[#819abd]">Page 3 · Groups</span>
          <button
            type="button"
            onClick={() => onNavigate?.('activities')}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#7654ff] to-[#5d45f1] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[#614bf1]/20 hover:brightness-110"
          >
            Next (Activities) <ArrowRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
};
