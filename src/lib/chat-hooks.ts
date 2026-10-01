/**
 * Hook points for message events. M4 ships in-app unread badges only — no
 * push or email. A future notifier registers here; it receives ids, never
 * message text, and must load anything it shows through the same access
 * checks as the app.
 */
export interface MessageSentEvent {
  messageId: string;
  conversationId: string;
  orgId: string;
  senderId: string;
  /** Active participants other than the sender who haven't blocked them. */
  recipientIds: string[];
  at: Date;
}

type Listener = (e: MessageSentEvent) => void | Promise<void>;
const listeners = new Set<Listener>();

/** Returns an unsubscribe function. */
export function registerOnMessageSent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called after a message is committed. A failing listener never fails the send. */
export async function onMessageSent(e: MessageSentEvent): Promise<void> {
  const results = await Promise.allSettled([...listeners].map(async (l) => l(e)));
  for (const r of results) if (r.status === "rejected") console.error("[turfcut] onMessageSent listener failed", r.reason);
}
