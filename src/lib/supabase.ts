import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase env vars. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Each browser gets a persistent random id + color so we know who's who
export function getUserId(): string {
  let id = localStorage.getItem('dreamland_user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('dreamland_user_id', id);
  }
  return id;
}

const COLORS = ['#9E7FFF', '#38bdf8', '#f472b6', '#fb923c', '#4ade80', '#facc15'];

export function getUserColor(): string {
  let color = localStorage.getItem('dreamland_user_color');
  if (!color) {
    color = COLORS[Math.floor(Math.random() * COLORS.length)];
    localStorage.setItem('dreamland_user_color', color);
  }
  return color;
}

export function getUserName(): string {
  return localStorage.getItem('dreamland_user_name') || 'Guest';
}

export function setUserName(name: string) {
  localStorage.setItem('dreamland_user_name', name);
}
