import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ChatMessage } from '../types';

interface TripChatProps {
  currentUserName: string;
}

export const TripChat: React.FC<TripChatProps> = ({ currentUserName }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(100);

        if (error) {
          console.error('Error fetching messages:', error);
        } else if (data) {
          setMessages(data);
        }
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    setInputText('');

    const { error } = await supabase.from('messages').insert({
      sender_name: currentUserName || 'Guest',
      text,
    });

    if (error) {
      console.error('Failed to send message:', error.message);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#171717]/60 border-l border-[#2F2F2F]">
      <div className="flex flex-shrink-0 items-center gap-2 px-4 py-3 border-b border-[#2F2F2F]">
        <MessageSquare className="w-4 h-4 text-[#38bdf8]" />
        <h2 className="text-sm font-semibold text-white">Trip Chat</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <p className="text-xs text-[#A3A3A3]">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-[#A3A3A3]">No messages yet. Say hi!</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="flex flex-col">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-[#9E7FFF]">{msg.sender_name}</span>
                <span className="text-[10px] text-[#666]">
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-sm text-white break-words">{msg.text}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="flex flex-shrink-0 items-center gap-2 p-3 border-t border-[#2F2F2F]">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-[#262626] border border-[#2F2F2F] text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-[#9E7FFF]"
          maxLength={500}
        />
        <button
          type="submit"
          className="bg-[#9E7FFF] hover:bg-[#8b65ff] text-white p-2 rounded-lg transition disabled:opacity-40"
          disabled={!inputText.trim()}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
