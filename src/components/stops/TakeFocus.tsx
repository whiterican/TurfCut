"use client";

import { useEffect } from "react";

/**
 * Moves focus to the element with `id` whenever `when` changes, which also brings it into view. The console's stop
 * links don't scroll (scroll={false} keeps the page where it is, and drops the #hash target), so without this the
 * inspector opened off screen and keyboard and screen-reader users were left in the table, told nothing.
 */
export function TakeFocus({ id, when }: { id: string; when: string }) {
  useEffect(() => {
    document.getElementById(id)?.focus();
  }, [id, when]);
  return null;
}
