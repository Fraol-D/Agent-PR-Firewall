import { createFakeClient } from "./fake-supabase.mjs";

export function createAdminClient() {
  return createFakeClient();
}

export function isAdminClientConfigured() {
  return true;
}
