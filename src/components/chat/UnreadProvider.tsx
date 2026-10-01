"use client";

import { createContext, useContext } from "react";
import { useUnread } from "@/components/chat/useUnread";

const UnreadContext = createContext(0);

/** One live unread count shared by the top bar and the tab bar. */
export function UnreadProvider({ initial, enabled, children }: { initial: number; enabled: boolean; children: React.ReactNode }) {
  const count = useUnread(initial, enabled);
  return <UnreadContext.Provider value={count}>{children}</UnreadContext.Provider>;
}

export const useUnreadCount = () => useContext(UnreadContext);
