import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Plus, Trash2, Wifi, WifiOff } from 'lucide-react';
import { supabase, getUserId } from '../lib/supabase';
import { Poll, PollVote, PageId } from '../types';

interface PollsProps {
  currentUserName: string;
  onNavigate?: (page: PageId) => void;
}

const userId = getUserId();

export const Polls: React.FC<PollsProps> = ({ onNavigate }) => {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<PollVote[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  useEffect(() => {
    async function fetchAll() {
      const [pollsRes, votesRes] = await Promise.all([
        supabase.from('polls').select('*').order('created_at', { ascending: false }),
        supabase.from('poll_votes').select('*'),
      ]);
      if (pollsRes.data) setPolls(pollsRes.data as Poll[]);
      if (votesRes.data) setVotes(votesRes.data as PollVote[]);
      setLoading(false);
    }
    fetchAll();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('polls-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, (payload) => {
        setPolls((prev) => {
          if (payload.eventType === 'DELETE') return prev.filter((p) => p.id !== (payload.old as Poll).id);
          const row = payload.new as Poll;
          return [row, ...prev.filter((p) => p.id !== row.id)];
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, (payload) => {
        setVotes((prev) => {
          if (payload.eventType === 'DELETE') return prev.filter((v) => v.id !== (payload.old as PollVote).id);
          const row = payload.new as PollVote;
          return [...prev.filter((v) => v.id !== row.id), row];
        });
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const createPoll = useCallback(async () => {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) return;

    const { error } = await supabase.from('polls').insert({
      question: question.trim(),
      options: cleanOptions,
      created_by: userId,
    });
    if (!error) {
      setQuestion('');
      setOptions(['', '']);
      setCreating(false);
    }
  }, [question, options]);

  const deletePoll = useCallback(async (pollId: string) => {
    const { error } = await supabase
      .from('polls')
      .delete()
      .eq('id', pollId)
      .eq('created_by', userId);

    if (!error) {
      setPolls((previous) => previous.filter((poll) => poll.id !== pollId));
      setVotes((previous) => previous.filter((vote) => vote.poll_id !== pollId));
    }
  }, []);

  const vote = useCallback(async (pollId: string, optionIndex: number) => {
    await supabase.from('poll_votes').upsert(
      { poll_id: pollId, voter_id: userId, option_index: optionIndex },
      { onConflict: 'poll_id,voter_id' }
    );
  }, []);

  return (
    <div className="min-h-full overflow-x-hidden bg-[#061226] p-2 text-white sm:p-3 md:overflow-x-visible">
      <section className="rounded-2xl border border-[#1e3b65] bg-[#07172d]/90 shadow-[0_18px_60px_rgba(0,0,0,.3)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1b355a] px-3 py-2 sm:px-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#4b51ff] to-[#7144e9] shadow-lg shadow-[#4b51ff]/30">
            <BarChart3 size={21} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">Polls</h2>
            <p className="text-[11px] text-[#adc1df] sm:text-xs">Vote live on trip decisions.</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#11284b] px-2 py-1.5 text-xs text-[#cfe0fb]">
            {connected ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-[#7890b3]" />}
            <span>{connected ? 'Live' : 'Connecting'}</span>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          {!creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mb-4 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#7654ff] to-[#5d45f1] px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
            >
              <Plus size={14} /> New Poll
            </button>
          ) : (
            <div className="mb-4 rounded-xl border border-[#214268] bg-[#091a32] p-3">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question..."
                className="w-full rounded-lg border border-[#2c4b70] bg-[#0d203b] px-3 py-2 text-sm text-white placeholder:text-[#5f7ba0] focus:outline-none focus:border-[#7654ff]"
              />
              <div className="mt-2 space-y-2">
                {options.map((opt, idx) => (
                  <input
                    key={idx}
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const next = [...options];
                      next[idx] = e.target.value;
                      setOptions(next);
                    }}
                    placeholder={`Option ${idx + 1}`}
                    className="w-full rounded-lg border border-[#2c4b70] bg-[#0d203b] px-3 py-2 text-sm text-white placeholder:text-[#5f7ba0] focus:outline-none focus:border-[#7654ff]"
                  />
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                {options.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setOptions([...options, ''])}
                    className="rounded-lg border border-[#31557f] bg-[#122b50] px-3 py-1.5 text-xs font-semibold text-[#d6e5fa] hover:bg-[#1b3b68]"
                  >
                    + Add option
                  </button>
                )}
                <button
                  type="button"
                  onClick={createPoll}
                  className="rounded-lg bg-gradient-to-r from-[#7654ff] to-[#5d45f1] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                >
                  Post Poll
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-lg border border-[#31557f] px-3 py-1.5 text-xs font-semibold text-[#d6e5fa] hover:bg-[#122b50]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[#a9bfdf]">Loading polls...</p>
          ) : polls.length === 0 ? (
            <p className="text-sm text-[#8fa9ca]">No polls yet. Create the first one!</p>
          ) : (
            <div className="space-y-3">
              {polls.map((poll) => {
                const pollVotes = votes.filter((v) => v.poll_id === poll.id);
                const totalVotes = pollVotes.length;
                const myVote = pollVotes.find((v) => v.voter_id === userId);

                return (
                  <div key={poll.id} className="rounded-xl border border-[#214268] bg-[#091a32] p-3">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold">{poll.question}</h3>
                      {poll.created_by === userId && (
                        <button
                          type="button"
                          onClick={() => deletePoll(poll.id)}
                          className="shrink-0 rounded-md p-1.5 text-[#8fa9ca] hover:bg-rose-500/15 hover:text-rose-300"
                          aria-label={`Delete poll: ${poll.question}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {poll.options.map((option, idx) => {
                        const count = pollVotes.filter((v) => v.option_index === idx).length;
                        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                        const isMine = myVote?.option_index === idx;

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => vote(poll.id, idx)}
                            className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                              isMine
                                ? 'border-[#6861ff] bg-[#1c2570]'
                                : 'border-[#2c4b70] bg-[#0d203b] hover:bg-[#122b50]'
                            }`}
                          >
                            <div
                              className="absolute inset-y-0 left-0 bg-[#31557f]/40"
                              style={{ width: `${pct}%` }}
                            />
                            <div className="relative flex items-center justify-between">
                              <span>{option}</span>
                              <span className="text-[#8fa9ca]">
                                {count} vote{count !== 1 ? 's' : ''} · {pct}%
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1b355a] px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={() => onNavigate?.('bus')}
            className="flex items-center gap-1.5 rounded-lg border border-[#284a73] bg-[#0d2343] px-3 py-1.5 text-xs text-[#b8cce7] hover:bg-[#1c3a66]"
          >
            <ArrowLeft size={15} /> Previous
          </button>
          <span className="text-xs text-[#819abd]">Page 2 · Polls</span>
          <button
            type="button"
            onClick={() => onNavigate?.('canvas')}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#7654ff] to-[#5d45f1] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[#614bf1]/20 hover:brightness-110"
          >
            Next (Canvas) <ArrowRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
};
