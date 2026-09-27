import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Sandwich, Send, Trash2, Wifi, WifiOff } from 'lucide-react';
import { supabase, getUserId } from '../lib/supabase';
import { PageId, SnackEntry } from '../types';

interface SnacksProps {
  currentUserName: string;
  onSetName: (name: string) => void;
  onNavigate?: (page: PageId) => void;
}

const userId = getUserId();

export const Snacks: React.FC<SnacksProps> = ({ currentUserName, onSetName, onNavigate }) => {
  const [entries, setEntries] = useState<SnackEntry[]>([]);
  const [snack, setSnack] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    async function fetchSnacks() {
      const { data } = await supabase
        .from('snack_entries')
        .select('*')
        .order('created_at', { ascending: true });
      if (data) setEntries(data as SnackEntry[]);
      setLoading(false);
    }
    fetchSnacks();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('snack-entries-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'snack_entries' }, (payload) => {
        setEntries((previous) => {
          if (payload.eventType === 'DELETE') {
            return previous.filter((entry) => entry.id !== (payload.old as SnackEntry).id);
          }
          const entry = payload.new as SnackEntry;
          return [...previous.filter((item) => item.id !== entry.id), entry].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, { userName: string; entries: SnackEntry[] }>();
    entries.forEach((entry) => {
      const group = groups.get(entry.user_id) ?? { userName: entry.user_name, entries: [] };
      group.userName = entry.user_name;
      group.entries.push(entry);
      groups.set(entry.user_id, group);
    });
    return Array.from(groups.values());
  }, [entries]);

  const addSnack = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanSnack = snack.trim();
    if (!cleanSnack || saving) return;

    let name = currentUserName.trim() || 'Guest';
    if (name === 'Guest') {
      const enteredName = window.prompt('Enter your name first:')?.trim();
      if (!enteredName) return;
      name = enteredName;
      onSetName(name);
    }

    setSaving(true);
    const { data, error } = await supabase
      .from('snack_entries')
      .insert({ user_id: userId, user_name: name, snack: cleanSnack })
      .select()
      .single();
    setSaving(false);

    if (!error && data) {
      setEntries((previous) => [...previous, data as SnackEntry]);
      setSnack('');
    }
  }, [currentUserName, onSetName, saving, snack]);

  const deleteSnack = useCallback(async (entry: SnackEntry) => {
    if (entry.user_id !== userId) return;
    const { error } = await supabase.from('snack_entries').delete().eq('id', entry.id).eq('user_id', userId);
    if (!error) setEntries((previous) => previous.filter((item) => item.id !== entry.id));
  }, []);

  return (
    <div className="min-h-full overflow-x-hidden bg-[#061226] p-2 text-white sm:p-3 md:overflow-x-visible">
      <section className="rounded-2xl border border-[#1e3b65] bg-[#07172d]/90 shadow-[0_18px_60px_rgba(0,0,0,.3)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1b355a] px-3 py-2 sm:px-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#4b51ff] to-[#7144e9] shadow-lg shadow-[#4b51ff]/30">
            <Sandwich size={21} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">Snacks</h2>
            <p className="text-[11px] text-[#adc1df] sm:text-xs">Keep track of who is bringing what.</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#11284b] px-2 py-1.5 text-xs text-[#cfe0fb]">
            {connected ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-[#7890b3]" />}
            <span>{connected ? 'Live' : 'Connecting'}</span>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          <form onSubmit={addSnack} className="mb-4 flex flex-col gap-2 rounded-xl border border-[#214268] bg-[#091a32] p-3 sm:flex-row">
            <input
              value={snack}
              onChange={(event) => setSnack(event.target.value)}
              placeholder="Add a snack..."
              maxLength={80}
              className="min-w-0 flex-1 rounded-lg border border-[#2c4b70] bg-[#0d203b] px-3 py-2 text-sm text-white placeholder:text-[#5f7ba0] focus:border-[#7654ff] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!snack.trim() || saving}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#7654ff] to-[#5d45f1] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={14} /> Add
            </button>
          </form>

          {loading ? (
            <p className="text-sm text-[#a9bfdf]">Loading snacks...</p>
          ) : groupedEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#31557f] bg-[#091a32]/60 px-4 py-8 text-center text-sm text-[#8fa9ca]">
              No snacks added yet. Be the first to bring something!
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {groupedEntries.map((group) => (
                <div key={group.entries[0].user_id} className="rounded-xl border border-[#214268] bg-[#091a32] p-3">
                  <h3 className="mb-2 text-sm font-semibold text-white">{group.userName}</h3>
                  <ul className="space-y-1.5">
                    {group.entries.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#0d2343] px-2.5 py-2 text-xs text-[#d6e5fa]">
                        <span className="min-w-0 truncate">• {entry.snack}</span>
                        {entry.user_id === userId && (
                          <button type="button" onClick={() => deleteSnack(entry)} className="shrink-0 rounded p-1 text-[#8fa9ca] hover:bg-rose-500/15 hover:text-rose-300" aria-label={`Delete ${entry.snack}`}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1b355a] px-3 py-2.5 sm:px-4">
          <button type="button" onClick={() => onNavigate?.('canvas')} className="flex items-center gap-1.5 rounded-lg border border-[#284a73] bg-[#0d2343] px-3 py-1.5 text-xs text-[#b8cce7] hover:bg-[#1c3a66]">
            <ArrowLeft size={15} /> Previous
          </button>
          <span className="text-xs text-[#819abd]">Page 4 · Snacks</span>
        </div>
      </section>
    </div>
  );
};
