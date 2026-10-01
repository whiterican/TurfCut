import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { attachmentLink } from "@/lib/chat-data";

/**
 * Downloads a chat attachment: checks the caller can see the message, then
 * redirects to a 60-second signed Storage link (download, never inline).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ messageId: string }> }) {
  const s = await getSessionProfile();
  if (!s) return new NextResponse("Sign in to download this file.", { status: 401 });
  const { messageId } = await ctx.params;
  const url = await attachmentLink({ userId: s.userId, role: s.role, orgId: s.orgId }, messageId);
  if (!url) return new NextResponse("File not found.", { status: 404 });
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
