"use client";

import { useEffect, useRef } from "react";

/**
 * Put inside a horizontally scrolling chip row: on arrival, scrolls the row
 * (not the page) so the chip marked aria-current is in view. Without it a
 * filter chosen from the sheet, or a link, can leave its chip off the edge of
 * a phone with nothing to say it is on.
 */
export function ScrollActiveChip() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const row = ref.current?.parentElement;
    const on = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row || !on) return;
    const to = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, to), behavior: "auto" });
  });
  return <span ref={ref} hidden />;
}
