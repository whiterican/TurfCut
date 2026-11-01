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

  // A newly selected row: focus the inspector's heading, and mark the row that is open (again
  // whenever the table re-renders its rows, e.g. on a sort).
  useEffect(() => {
    if (selected) document.getElementById("inspector-heading")?.focus();
    const mark = () =>
      document.querySelectorAll<HTMLElement>(`[data-inspector-source] a[href^="${CSS.escape(rowHref)}/"]`).forEach((a) => {
        const open = !!selected && a.getAttribute("href")?.startsWith(`${rowHref}/${selected}`);
        if (open && a.getAttribute("aria-current") !== "true") a.setAttribute("aria-current", "true");
        else if (!open && a.hasAttribute("aria-current")) a.removeAttribute("aria-current");
      });
    mark();
    const source = document.querySelector("[data-inspector-source]");
    const watch = source && new MutationObserver(mark);
    watch?.observe(source!, { childList: true, subtree: true });
    return () => watch?.disconnect();
  }, [selected, rowHref]);

  // Esc or Close: back to the list, focus on the row that was open.
  useEffect(() => {
    if (!selected) return;
    const back = () => {
      const next = new URLSearchParams(params.toString());
      next.delete("selected");
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-inspector-source] a[href^="${CSS.escape(rowHref)}/${CSS.escape(selected)}"]`)?.focus());
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || ev.defaultPrevented) return;
      const t = ev.target as Element | null;
      if (!t?.closest?.("[data-inspector]")) return;
      // Esc in a field or an open disclosure belongs to it (a half-typed note is never thrown away).
      if (t.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), details[open], dialog[open]")) return;
      back();
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
