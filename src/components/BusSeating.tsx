import React, { useEffect, useState, useCallback } from 'react';
import { ArrowRight, Bus, ChevronLeft, ChevronRight, CircleUserRound, Shuffle, Wifi, WifiOff } from 'lucide-react';
import { supabase, getUserId } from '../lib/supabase';
import { seatLayout } from '../lib/seatLayout';
import { PageId, Seat } from '../types';

interface BusSeatingProps {
  currentUserName: string;
  onSetName: (name: string) => void;
  onNavigate?: (page: PageId) => void;
}

const userId = getUserId();

export const BusSeating: React.FC<BusSeatingProps> = ({ currentUserName, onSetName, onNavigate }) => {
  const [seats, setSeats] = useState<Record<string, Seat>>({});
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claimingSeat, setClaimingSeat] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSeats() {
      const { data, error } = await supabase.from('seats').select('*');
      if (error) {
        console.error('Failed to fetch seats:', error.message);
      } else if (data) {
        const map: Record<string, Seat> = {};
        (data as Seat[]).forEach((row) => {
          map[row.id] = row;
        });
        setSeats(map);
      }
      setLoading(false);
    }
    fetchSeats();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('seats-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seats' },
        (payload) => {
          setSeats((prev) => {
            const next = { ...prev };
            if (payload.eventType === 'DELETE') {
              delete next[(payload.old as Seat).id];
            } else {
              const row = payload.new as Seat;
              next[row.id] = row;
            }
            return next;
          });
        }
      )
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const claimSeat = useCallback(
    async (seatId: string, seatLabel: string) => {
      setClaimError(null);
      const existing = seats[seatId];

      if (existing?.claimed_by === userId) {
        setClaimingSeat(seatId);
        const { error } = await supabase.from('seats').delete().eq('id', seatId);
        setClaimingSeat(null);
        if (error) {
          console.error('Failed to release seat:', error.message);
          setClaimError('That seat could not be released. Please try again.');
        }
        return;
      }

      if (existing?.claimed_by && existing.claimed_by !== userId) return;

      const name = currentUserName && currentUserName !== 'Guest'
        ? currentUserName
        : prompt('Enter your name to claim this seat:');
      if (!name || !name.trim()) return;

      if (!currentUserName || currentUserName === 'Guest') {
        onSetName(name.trim());
      }

      setClaimingSeat(seatId);
      const { error } = await supabase.rpc('claim_bus_seat', {
        p_seat_id: seatId,
        p_seat_label: seatLabel,
        p_occupant_name: name.trim(),
        p_claimed_by: userId,
      });
      setClaimingSeat(null);
      if (error) {
        console.error('Failed to claim seat:', error.message);
        setClaimError(
          error.message.toLowerCase().includes('occupied')
            ? 'That seat was just taken. Please choose another seat.'
            : 'That seat could not be claimed. Please try again.'
        );
      }
    },
    [seats, currentUserName, onSetName]
  );

  const seatColor = (seatId: string) => {
    const seat = seats[seatId];
    if (!seat?.claimed_by) return 'bg-[#91a8c8] hover:bg-[#a8bdd9] border-[#b9cbe3] text-[#13213a]';
    if (seat.claimed_by === userId)
      return 'bg-[#ffc84d] hover:bg-[#ffd66f] border-[#ffe29a] text-[#15233d]';
    return 'bg-gradient-to-br from-[#8e7cff] to-[#b27dff] hover:from-[#a194ff] hover:to-[#c394ff] border-[#c4b8ff] text-[#151b42]';
  };

  const SeatTile = ({ id, label }: { id: string; label: string }) => {
    const seat = seats[id];
    return (
      <button
        onClick={() => claimSeat(id, label)}
        disabled={claimingSeat !== null}
        className={`h-[48px] w-[48px] rounded-[9px] border shadow-[0_2px_6px_rgba(0,0,0,.25)] flex flex-col items-center justify-center text-[8px] font-semibold transition-all hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-80 sm:h-[52px] sm:w-[52px] ${seatColor(
          id
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
        <span className="mt-0.5 max-w-[44px] truncate px-0.5 text-[7px]">{seat?.occupant_name || 'Empty'}</span>
      </button>
    );
  };

  const rowNumbers = [1, 2, 3, 4, 5, 6, 7, 8];
  const backRow = seatLayout.filter((s) => s.side === 'back');
  const findSeat = (id: string) => seatLayout.find((s) => s.id === id)!;
  const currentSeat = Object.values(seats).find((seat) => seat.claimed_by === userId);

  return (
    <div className="min-h-full bg-[#061226] p-2 text-white sm:p-3">
      <section className="rounded-2xl border border-[#1e3b65] bg-[#07172d]/90 shadow-[0_18px_60px_rgba(0,0,0,.3)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1b355a] px-3 py-2 sm:px-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#4b51ff] to-[#7144e9] shadow-lg shadow-[#4b51ff]/30">
            <Bus size={21} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">Bus Seating</h2>
            <p className="text-[11px] text-[#adc1df] sm:text-xs">Let&apos;s figure out who sits where. Tap a seat to claim it.</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#11284b] px-2 py-1.5 text-xs text-[#cfe0fb]">
            {connected ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-[#7890b3]" />}
            <span>{connected ? 'Live' : 'Connecting'}</span>
          </div>
          <div className="flex w-full items-center justify-between rounded-lg bg-[#102442] px-1.5 py-1 sm:w-auto sm:min-w-[150px] sm:justify-center sm:gap-4">
            <button aria-label="Previous page" className="rounded-lg p-1 text-[#a9c1e4] hover:bg-[#1c3a66]"><ChevronLeft size={20} /></button>
            <span className="text-sm font-semibold">1 / 6</span>
            <button aria-label="Next page" onClick={() => onNavigate?.('polls')} className="rounded-lg p-1 text-[#a9c1e4] hover:bg-[#1c3a66]"><ChevronRight size={20} /></button>
          </div>
        </div>

        <div className="grid gap-3 p-2 sm:p-3 xl:grid-cols-[minmax(0,1fr)_170px]">
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
                          <SeatTile id={`${row}A`} label={findSeat(`${row}A`).seat_label} />
                          <SeatTile id={`${row}B`} label={findSeat(`${row}B`).seat_label} />
                        </div>
                        <div className="w-2 text-center text-[6px] uppercase tracking-wider text-[#567294] sm:w-5 sm:text-[7px]">aisle</div>
                        <div className="flex gap-1 sm:gap-1.5">
                          <SeatTile id={`${row}C`} label={findSeat(`${row}C`).seat_label} />
                          <SeatTile id={`${row}D`} label={findSeat(`${row}D`).seat_label} />
                          <SeatTile id={`${row}E`} label={findSeat(`${row}E`).seat_label} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 border-t border-[#29486b] pt-2">
                    <div className="flex justify-center gap-1 sm:gap-1.5">
                      {backRow.map((s) => <SeatTile key={s.id} id={s.id} label={s.seat_label} />)}
                    </div>
                    <div className="mt-1.5 text-center text-[8px] uppercase tracking-[.3em] text-[#6382aa]">Back bench</div>
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

          <aside className="flex flex-col gap-4">
            <div className="rounded-xl border border-[#214268] bg-[#091a32] p-3">
              <h3 className="mb-3 text-xs font-semibold">Seat Legend</h3>
              <div className="space-y-2 text-[11px] text-[#b4c8e5]">
                <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#91a8c8]" />Available</span>
                <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#9d7dff]" />Occupied</span>
                <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#ffc84d]" />Your seat</span>
              </div>
              <div className="mt-3 border-t border-[#243e62] pt-3 text-[11px] leading-4 text-[#8ea8cb]">Click a seat to view or claim it.</div>
            </div>

            <div className="mt-auto rounded-xl border border-[#214268] bg-[#091a32] p-3">
              <div className="mb-2 text-[11px] font-semibold text-[#cbdaf0]">Your Seat</div>
              <div className="flex items-center gap-2 text-xs text-white">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ffc84d]" />
                {currentSeat ? currentSeat.id : 'Not selected'}
              </div>
              {currentSeat && <div className="mt-1 pl-4 text-[10px] text-[#8fa9ca]">{currentSeat.seat_label}</div>}
              <button
                type="button"
                disabled={!currentSeat}
                onClick={() => currentSeat && claimSeat(currentSeat.id, currentSeat.seat_label)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#31557f] bg-[#122b50] px-2 py-1.5 text-[11px] font-semibold text-[#d6e5fa] hover:bg-[#1b3b68] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Shuffle size={14} /> Change Seat
              </button>
            </div>
          </aside>
        </div>

        {claimError && <p className="border-t border-[#592e58] bg-[#311d3b] px-4 py-2 text-xs text-rose-300">{claimError}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1b355a] px-3 py-2.5 sm:px-4">
          <button type="button" disabled className="flex items-center gap-1.5 rounded-lg border border-[#284a73] bg-[#0d2343] px-3 py-1.5 text-xs text-[#b8cce7] opacity-60"><ChevronLeft size={15} /> Previous</button>
          <span className="text-xs text-[#819abd]">Page 1 · Bus Seating</span>
          <button type="button" onClick={() => onNavigate?.('polls')} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#7654ff] to-[#5d45f1] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[#614bf1]/20 hover:brightness-110">Next (Polls) <ArrowRight size={15} /></button>
        </div>
      </section>
    </div>
  );
};
