import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Shield, Edit2 } from 'lucide-react';
import { PresenceUser } from '../types';

interface TopNavProps {
  presenceUsers: PresenceUser[];
  currentUserName: string;
  onUpdateName: (name: string) => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  presenceUsers = [],
  currentUserName,
  onUpdateName,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(currentUserName);
  const [isOnlineMenuOpen, setIsOnlineMenuOpen] = useState(false);
  const onlineMenuRef = useRef<HTMLDivElement>(null);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim()) {
      onUpdateName(tempName.trim());
      setIsEditingName(false);
    }
  };

  const onlineCount = Math.max(1, presenceUsers.length);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!onlineMenuRef.current?.contains(event.target as Node)) {
        setIsOnlineMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const onlineUsers = presenceUsers.length > 0
    ? presenceUsers
    : [{ id: 'current-user', name: currentUserName, color: '#9E7FFF' }];

  return (
    <header className="h-16 bg-[#171717]/80 backdrop-blur-md border-b border-[#2F2F2F] px-3 md:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 md:h-10 md:w-10 rounded-xl bg-gradient-to-br from-[#9E7FFF] to-[#38bdf8] flex items-center justify-center shadow-lg shadow-[#9E7FFF]/20">
          <span className="text-xl">🌴</span>
        </div>
        <div>
          <h1 className="text-white font-bold tracking-wide text-base md:text-lg flex items-center gap-1.5">
            DREAMLAND <Sparkles className="w-4 h-4 text-[#38bdf8] animate-pulse" />
          </h1>
          <p className="hidden sm:block text-xs text-[#A3A3A3]">School Trip 2025 • 10 Oct</p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-6">
        <div ref={onlineMenuRef} className="relative hidden sm:block">
          <button
            type="button"
            aria-expanded={isOnlineMenuOpen}
            aria-label="Show online users"
            onClick={() => setIsOnlineMenuOpen((open) => !open)}
            className="flex items-center gap-3 bg-[#262626]/80 px-4 py-2 rounded-full border border-[#2F2F2F] hover:bg-[#2F2F2F] transition"
          >
          <div className="flex -space-x-2 overflow-hidden">
            {presenceUsers.slice(0, 5).map((user, idx) => {
              const initials = user.name
                ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                : 'U';
              return (
                <div
                  key={user.id || idx}
                  className="inline-block h-8 w-8 rounded-full ring-2 ring-[#171717] flex items-center justify-center text-xs font-bold text-white shadow-md transition-transform hover:scale-110"
                  style={{ backgroundColor: user.color || '#9E7FFF' }}
                  title={`${user.name} (Online)`}
                >
                  {initials}
                </div>
              );
            })}
            {presenceUsers.length === 0 && (
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-[#171717] flex items-center justify-center text-xs font-bold text-white bg-[#9E7FFF]">
                {currentUserName ? currentUserName.slice(0, 2).toUpperCase() : 'ME'}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#10b981]"></span>
            </span>
            <span className="text-xs font-medium text-white">{onlineCount} online</span>
          </div>
          </button>

          {isOnlineMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-[#33476a] bg-[#101d34] p-3 shadow-2xl shadow-black/40">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#8fa8ca]">Online now</p>
              <div className="max-h-60 space-y-1 overflow-y-auto">
                {onlineUsers.map((user, idx) => (
                  <div key={user.id || idx} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                    <span className="truncate">{user.name || 'Guest'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isEditingName ? (
            <form onSubmit={handleSaveName} className="flex items-center gap-2">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className="bg-[#262626] border border-[#9E7FFF] text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none w-28"
                autoFocus
                placeholder="Your name"
                maxLength={20}
              />
              <button
                type="submit"
                className="bg-[#9E7FFF] text-white text-xs px-2.5 py-1.5 rounded-lg hover:bg-[#8b65ff] transition"
              >
                Save
              </button>
            </form>
          ) : (
            <button
              onClick={() => {
                setTempName(currentUserName);
                setIsEditingName(true);
              }}
              className="flex items-center gap-2 bg-[#262626] hover:bg-[#2F2F2F] transition border border-[#2F2F2F] px-3.5 py-1.5 rounded-full text-xs text-white group"
              title="Click to change your chat display name"
            >
              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-[#9E7FFF] to-[#38bdf8] flex items-center justify-center text-[10px] font-bold">
                {currentUserName ? currentUserName[0].toUpperCase() : 'U'}
              </div>
              <span className="font-medium">{currentUserName}</span>
              <Edit2 className="w-3 h-3 text-[#A3A3A3] group-hover:text-white transition" />
            </button>
          )}

          <div className="hidden md:flex items-center gap-1.5 bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/30 px-3.5 py-1.5 rounded-full text-amber-300 text-xs font-semibold shadow-inner">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
};
