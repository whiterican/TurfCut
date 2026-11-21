"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { TurfPolygon } from "@/lib/field-day";

/**
 * Picking a turf that is already on the Field map (Caden, Nov 21: "keep building", the follow-up to
 * assigning turf from the map): tap its zone, or the button on its card, and the Assign panel opens
 * starting from that turf instead of a blank map. Only there for people who may assign turf: without
 * the provider the map's zones are not tappable and the cards carry no button.
 */
export interface PickedTurf {
  id: string;
  name: string;
  turf: TurfPolygon;
  /** Goes up on every pick, so picking the same turf again opens the panel again. */
  nonce: number;
}

interface TurfPick {
  picked: PickedTurf | null;
  pick: (zone: { id: string; name: string; turf: TurfPolygon }) => void;
  clear: () => void;
}

const Ctx = createContext<TurfPick | null>(null);

/** Null where nobody may assign turf (no provider): callers render nothing extra then. */
export const useTurfPick = () => useContext(Ctx);

export function TurfPickProvider({ children }: { children: ReactNode }) {
  const [picked, setPicked] = useState<PickedTurf | null>(null);
  const pick = useCallback((zone: { id: string; name: string; turf: TurfPolygon }) => setPicked((p) => ({ ...zone, nonce: (p?.nonce ?? 0) + 1 })), []);
  const clear = useCallback(() => setPicked(null), []);
  const value = useMemo(() => ({ picked, pick, clear }), [picked, pick, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** On a turf's card: open the Assign panel starting from this turf. The keyboard's way to what a tap on the map's zone does. */
export function AssignThisTurfButton({ id, name, turf }: { id: string; name: string; turf: TurfPolygon }) {
  const ctx = useTurfPick();
  if (!ctx) return null;
  return (
    <button type="button" className="btn-secondary btn-sm" aria-label={`Assign ${name} to shifts`} onClick={() => ctx.pick({ id, name, turf })}>
      Assign this turf
    </button>
  );
}
