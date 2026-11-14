import { createFakeClient } from "./fake-supabase.mjs";

export async function createClient() {
  return createFakeClient();
}

export function isSupabaseConfigured() {
  return true;
}
