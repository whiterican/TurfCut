import { headers } from "next/headers";
import { getSiteUrl } from "@/lib/env";

/**
 * Origin for links in emails. Production uses SITE_URL only; request
 * headers are trusted in local development, where there's no attacker.
 */
export async function siteOrigin(): Promise<string | null> {
  const configured = getSiteUrl();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return null;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  return `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}`;
}
