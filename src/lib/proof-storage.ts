import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/env";

/**
 * Proof photos live in their own PRIVATE Supabase Storage bucket, sealed
 * with CREDENTIAL_PROOF_KEY before they leave the server (proof-photos.ts).
 * Only the server touches the bucket (service role), after the app's access
 * checks, and streams the photo through a signed-in route: never a public
 * or signed link.
 */
export const PROOF_BUCKET = "credential-proofs";

export interface ProofStore {
  put(path: string, bytes: Uint8Array): Promise<void>;
  /** The stored bytes, or null when there's no such file. */
  get(path: string): Promise<Uint8Array | null>;
  /** Removing a file that's already gone is fine. */
  remove(paths: string[]): Promise<void>;
}

/** Where a photo is kept: under its worker, named by its id (nothing else in the name). */
export const proofPath = (workerId: string, proofId: string) => `${workerId}/${proofId}`;

export function supabaseProofStore(): ProofStore {
  const bucket = () =>
    createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(PROOF_BUCKET);
  return {
    async put(path, bytes) {
      const { error } = await bucket().upload(path, bytes, { contentType: "application/octet-stream", upsert: false });
      if (error) throw new Error(`[turfcut] proof photo upload failed: ${error.message}`);
    },
    async get(path) {
      const { data, error } = await bucket().download(path);
      if (error || !data) {
        if (/not.?found|404/i.test(error?.message ?? "")) return null;
        throw new Error(`[turfcut] proof photo download failed: ${error?.message ?? "no data"}`);
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(paths) {
      if (!paths.length) return;
      const { error } = await bucket().remove(paths);
      if (error) throw new Error(`[turfcut] proof photo removal failed: ${error.message}`);
    },
  };
}
