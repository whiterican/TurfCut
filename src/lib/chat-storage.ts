import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/env";

/**
 * Chat attachments live in a PRIVATE Supabase Storage bucket. Only the
 * server touches it (service role), after the app's access checks; viewers
 * get a 60-second signed download link, never a public URL.
 */
export const CHAT_BUCKET = "chat-attachments";
export const SIGNED_URL_SECONDS = 60;

export interface AttachmentStore {
  put(path: string, bytes: Uint8Array, type: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** A short-lived link that downloads (never renders inline) as `name`. */
  signedUrl(path: string, name: string): Promise<string>;
}

export function supabaseStore(): AttachmentStore {
  const bucket = () =>
    createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(CHAT_BUCKET);
  return {
    async put(path, bytes, type) {
      const { error } = await bucket().upload(path, bytes, { contentType: type, upsert: false });
      if (error) throw new Error(`[turfcut] attachment upload failed: ${error.message}`);
    },
    async remove(path) {
      const { error } = await bucket().remove([path]);
      if (error) console.error("[turfcut] attachment cleanup failed", error.message);
    },
    async signedUrl(path, name) {
      const { data, error } = await bucket().createSignedUrl(path, SIGNED_URL_SECONDS, { download: name });
      if (error || !data) throw new Error(`[turfcut] attachment link failed: ${error?.message ?? "no URL"}`);
      return data.signedUrl;
    },
  };
}
