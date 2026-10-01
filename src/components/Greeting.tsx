"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** "Good morning" in the viewer's own time zone; the server render says "Today". */
export function Greeting() {
  const hour = useSyncExternalStore(noop, () => new Date().getHours(), () => -1);
  return <>{hour < 0 ? "Today" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}</>;
}
