"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { TurfPolygon } from "@/lib/field-day";

/**
 * Picking a turf that is already on the Field map (Caden, Nov 21: "keep building", the follow-up to
 * assigning turf from the map): the button on its card, or under the map once its zone is tapped, opens
 * the Assign panel starting from that turf instead of a blank map. Only there for people who may assign
 * turf: without the provider the map's zones are not tappable and there is no button.
 */
export interface PickedTurf {
  /** The zone's id. Its name is not kept: unnamed turfs are numbered by position, so the panel asks the page what the id is called now. */
  id: string;
  turf: TurfPolygon;
  /** Goes up on every pick and never back, so any pick (the same turf again, or the first after Close) opens the panel. */
  nonce: number;
}

type Zone = { id: string; turf: TurfPolygon };

/** The picked turf and how many picks there have been. The count outlives a clear: a pick after Close must not reuse the last pick's number. */
export interface PickState {
  picked: PickedTurf | null;
  count: number;
}
export type PickAction = { type: "pick"; zone: Zone } | { type: "clear" };

export function pickReducer(state: PickState, action: PickAction): PickState {
  if (action.type === "clear") return state.picked ? { ...state, picked: null } : state;
  const count = state.count + 1;
  return { picked: { ...action.zone, nonce: count }, count };
}

interface TurfPick {
  picked: PickedTurf | null;
  pick: (zone: Zone) => void;
  clear: () => void;
}

const Ctx = createContext<TurfPick | null>(null);

/** Null where nobody may assign turf (no provider): callers render nothing extra then. */
export const useTurfPick = () => useContext(Ctx);

/** `initial` starts with a turf already picked. The Field page never passes it; tests do, to see the open panel without a browser. */
export function TurfPickProvider({ children, initial }: { children: ReactNode; initial?: Zone }) {
  const [state, dispatch] = useReducer(pickReducer, initial, (z): PickState => (z ? { picked: { ...z, nonce: 1 }, count: 1 } : { picked: null, count: 0 }));
  const pick = useCallback((zone: Zone) => dispatch({ type: "pick", zone }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  const value = useMemo(() => ({ picked: state.picked, pick, clear }), [state.picked, pick, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Open the Assign panel starting from this turf. On each turf's card, and under the map for the zone tapped there.
 * The spoken name starts with the words on the button, so "click Assign this turf" works for voice control.
 */
export function AssignThisTurfButton({ id, name, turf }: Zone & { /** As its card names it, or "" for a zone no card names yet. */ name: string }) {
  const ctx = useTurfPick();
  if (!ctx) return null;
  return (
    <button type="button" className="btn-secondary btn-sm shrink-0" aria-label={name ? `Assign this turf: ${name}` : undefined} onClick={() => ctx.pick({ id, turf })}>
      Assign this turf
    </button>
  );
}
