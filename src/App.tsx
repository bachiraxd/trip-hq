import React, { useState, useEffect, useRef } from 'react';
import { Bus, BarChart3, Menu, MessageCircle, PenTool, Sandwich, X } from 'lucide-react';
import { supabase, getUserId, getUserColor, getUserName, setUserName } from './lib/supabase';
import { TopNav } from './components/TopNav';
import { TripChat } from './components/TripChat';
import { BusPlanner } from './components/BusPlanner';
import { Polls } from './components/Polls';
import { Canvas } from './components/Canvas';
import { Snacks } from './components/Snacks';
import { PageId, PresenceUser } from './types';

const userId = getUserId();
const userColor = getUserColor();

const NAV_ITEMS: { id: PageId; label: string; icon: React.ReactNode }[] = [
  { id: 'bus', label: 'Bus & Groups', icon: <Bus size={18} /> },
  { id: 'polls', label: 'Polls', icon: <BarChart3 size={18} /> },
  { id: 'canvas', label: 'Canvas', icon: <PenTool size={18} /> },
  { id: 'moments', label: 'Snacks', icon: <Sandwich size={18} /> },
];

function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('bus');
  const [currentUserName, setCurrentUserName] = useState(getUserName());
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [mobileDrawer, setMobileDrawer] = useState<'nav' | 'chat' | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const channel = supabase.channel('trip-presence', {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: PresenceUser[] = Object.values(state)
          .flat()
          .map((entry) => entry as unknown as PresenceUser);
        setPresenceUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            id: userId,
            name: currentUserName,
            color: userColor,
            page: currentPage,
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserName, currentPage]);

  const handleUpdateName = (name: string) => {
    setUserName(name);
    setCurrentUserName(name);
  };

  const handleNavigate = (page: PageId) => {
    setCurrentPage(page);
    setMobileDrawer(null);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current = touch.clientX <= 24 || touch.clientX >= window.innerWidth - 24
      ? { x: touch.clientX, y: touch.clientY }
      : null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
    if (start.x <= 24 && dx > 0) setMobileDrawer('nav');
    if (start.x >= window.innerWidth - 24 && dx < 0) setMobileDrawer('chat');
  };

  return (
    <div
      className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#061226]"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <TopNav
        presenceUsers={presenceUsers}
        currentUserName={currentUserName}
        onUpdateName={handleUpdateName}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <nav className="w-56 bg-[#07172d] border-r border-[#1a3559] p-3 space-y-2 hidden md:block">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                currentPage === item.id
                  ? 'border border-[#6861ff] bg-gradient-to-r from-[#273caf] to-[#3929a2] text-white shadow-lg shadow-[#302bd0]/20'
                  : 'text-[#a9bedb] hover:bg-[#10284a] hover:text-white'
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${currentPage === item.id ? 'bg-[#4054df]' : 'bg-[#10284a]'}`}>
                {item.icon}
              </span>
              <span className="text-left">{item.label}</span>
            </button>
          ))}
        </nav>

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto md:overflow-x-visible">
          {currentPage === 'bus' && (
            <BusPlanner currentUserName={currentUserName} onSetName={handleUpdateName} onNavigate={handleNavigate} />
          )}
          {currentPage === 'polls' && (
            <Polls currentUserName={currentUserName} onNavigate={handleNavigate} />
          )}
          {currentPage === 'canvas' && <Canvas onNavigate={handleNavigate} />}
          {currentPage === 'moments' && (
            <Snacks currentUserName={currentUserName} onSetName={handleUpdateName} onNavigate={handleNavigate} />
          )}
        </main>

        <aside className={`fixed inset-y-0 right-0 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col bg-[#07172d] shadow-2xl transition-transform duration-300 ease-out lg:static lg:z-auto lg:flex lg:w-80 lg:flex-col lg:min-h-0 lg:translate-x-0 lg:shadow-none ${mobileDrawer === 'chat' ? 'translate-x-0' : 'translate-x-full'}`}>
          <button
            type="button"
            aria-label="Close trip chat"
            onClick={() => setMobileDrawer(null)}
            className="absolute right-3 top-3 z-10 rounded-lg bg-[#122b50] p-2 text-white lg:hidden"
          >
            <X size={18} />
          </button>
          <TripChat currentUserName={currentUserName} />
        </aside>
      </div>

      {mobileDrawer && (
        <button
          type="button"
          aria-label="Close drawer"
          onClick={() => setMobileDrawer(null)}
          className="fixed inset-0 z-40 bg-black/55 md:hidden"
        />
      )}

      <nav className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[calc(100vw-2rem)] bg-[#07172d] border-r border-[#1a3559] p-3 shadow-2xl transition-transform duration-300 ease-out md:hidden ${mobileDrawer === 'nav' ? 'translate-x-0' : '-translate-x-full'}`}>
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileDrawer(null)}
          className="absolute right-3 top-3 rounded-lg bg-[#122b50] p-2 text-white"
        >
          <X size={18} />
        </button>
        <div className="mt-12 space-y-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                currentPage === item.id
                  ? 'border border-[#6861ff] bg-gradient-to-r from-[#273caf] to-[#3929a2] text-white shadow-lg shadow-[#302bd0]/20'
                  : 'text-[#a9bedb] hover:bg-[#10284a] hover:text-white'
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${currentPage === item.id ? 'bg-[#4054df]' : 'bg-[#10284a]'}`}>
                {item.icon}
              </span>
              <span className="text-left">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-30 flex justify-between px-3 md:hidden">
        <button type="button" aria-label="Open navigation" onClick={() => setMobileDrawer('nav')} className="pointer-events-auto rounded-xl border border-[#31557f] bg-[#0d2343]/95 p-2.5 text-white shadow-lg">
          <Menu size={19} />
        </button>
        <button type="button" aria-label="Open trip chat" onClick={() => setMobileDrawer('chat')} className="pointer-events-auto rounded-xl border border-[#31557f] bg-[#0d2343]/95 p-2.5 text-white shadow-lg">
          <MessageCircle size={19} />
        </button>
      </div>
    </div>
  );
}

export default App;
