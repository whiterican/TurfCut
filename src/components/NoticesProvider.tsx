"use client";

import { createContext, useContext } from "react";

const NoticesContext = createContext(0);

/** The signed-in person's unread notification count, counted once by the root layout and shared with the header's bell, the page bell and the More sheet. */
export function NoticesProvider({ count, children }: { count: number; children: React.ReactNode }) {
  return <NoticesContext.Provider value={count}>{children}</NoticesContext.Provider>;
}

export const useNoticesCount = () => useContext(NoticesContext);
