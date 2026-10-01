import { PIN_CATEGORIES, type PinCategory } from "@/lib/field-day";
import type { MapPin } from "@/components/TurfMap";

export interface WorkbenchPin {
  id: string;
  lat: number;
  lng: number;
  category: PinCategory;
  label: string | null;
}

export const pinColor = (c: PinCategory) => PIN_CATEGORIES.find((p) => p.value === c)!.color;
export const pinLabel = (c: PinCategory) => PIN_CATEGORIES.find((p) => p.value === c)!.label;

/**
 * Map pins for display: colour by category, tooltip "Category · label".
 * Plain module (not "use client"), so server pages can call it too.
 */
export function toMapPins(pins: WorkbenchPin[]): MapPin[] {
  return pins.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, color: pinColor(p.category), label: p.label ? `${pinLabel(p.category)} · ${p.label}` : pinLabel(p.category) }));
}
