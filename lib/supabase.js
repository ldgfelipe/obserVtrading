import { createClient } from '@supabase/supabase-js';
import { CONFIG } from './config.js';

let client = null;

export function getSupabase() {
  if (!client) {
    client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY || CONFIG.SUPABASE_ANON_KEY);
  }
  return client;
}

export async function savePairsSnapshot(rows) {
  const sb = getSupabase();
  return sb.from('pairs_snapshot').insert(rows);
}

export async function getLatestPairs() {
  const sb = getSupabase();
  return sb.from('pairs_snapshot').select('*').order('created_at', { ascending: false }).limit(50);
}

export async function getBotState() {
  const sb = getSupabase();
  return sb.from('bot_state').select('*').eq('id', 1).single();
}

export async function updateBotState(patch) {
  const sb = getSupabase();
  patch.updated_at = new Date().toISOString();
  return sb.from('bot_state').upsert({ id: 1, ...patch });
}

export async function logCycle(info) {
  const sb = getSupabase();
  return sb.from('cycles').insert(info);
}

export async function logSignal(decision) {
  const sb = getSupabase();
  return sb.from('signals').insert(decision);
}

export async function logOrder(order) {
  const sb = getSupabase();
  return sb.from('orders').insert(order);
}

export async function getLastSignal() {
  const sb = getSupabase();
  return sb.from('signals').select('*').order('created_at', { ascending: false }).limit(1).single();
}

export async function getLastOrder() {
  const sb = getSupabase();
  return sb.from('orders').select('*').order('created_at', { ascending: false }).limit(1).single();
}