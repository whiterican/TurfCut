"use client";

import { createContext, useContext } from "react";

/**
 * Who is looking, coarsely: enough for client-only screens (error
 * boundaries) to word themselves for a worker or an organization. Set once
 * by the root layout from the session; carries no ids or details.
 */
export type ViewerKind = "worker" | "org" | "none";

const Ctx = createContext<ViewerKind>("none");

export function ViewerKindProvider({ kind, children }: { kind: ViewerKind; children: React.ReactNode }) {
  return <Ctx.Provider value={kind}>{children}</Ctx.Provider>;
}

export const useViewerKind = () => useContext(Ctx);
