"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Opens a row in the inspector instead of its own page, on screens wide
 * enough to show one (redesign §4.3: from 1280 beside the organization
 * rail). Rows stay ordinary links to their detail route, so without script,
 * or on a narrower screen, they open the full page as before.
 *
 * Focus: selecting a row moves it to the inspector's heading; Esc or Close
 * hands it back to the row. The inspector is a labelled region, not a modal,
 * so the list stays usable around it.
 */
export function InspectorSelect({ rowHref, minWidth = "80rem" }: { /** The detail route's prefix; a row link is `${rowHref}/${id}`. */ rowHref: string; minWidth?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("selected");

  // Rows → inspector, on wide screens only.
  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (!window.matchMedia(`(min-width: ${minWidth})`).matches) return;
      const a = (ev.target as Element | null)?.closest?.("a[href]");
      const href = a?.getAttribute("href") ?? "";
      if (!a?.closest("[data-inspector-source]") || !href.startsWith(`${rowHref}/`)) return;
      const id = href.slice(rowHref.length + 1).split(/[/?#]/)[0];
      if (!id) return;
      ev.preventDefault();
      const next = new URLSearchParams(params.toString());
      next.set("selected", id);
      router.replace(`${pathname}?${next}`, { scroll: false });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [rowHref, minWidth, params, pathname, router]);

  // A newly selected row: focus the inspector's heading.
  useEffect(() => {
    if (selected) document.getElementById("inspector-heading")?.focus();
  }, [selected]);

  // Esc or Close: back to the list, focus on the row that was open.
  useEffect(() => {
    if (!selected) return;
    const back = () => {
      const next = new URLSearchParams(params.toString());
      next.delete("selected");
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-inspector-source] a[href^="${rowHref}/${selected}"]`)?.focus());
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && (ev.target as Element | null)?.closest?.("[data-inspector]")) back();
    };
    const onClose = (ev: MouseEvent) => {
      if ((ev.target as Element | null)?.closest?.("[data-inspector-close]")) {
        ev.preventDefault();
        back();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClose);
    };
  }, [selected, params, pathname, router, rowHref]);

  return null;
}
