"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Count successful external controls belonging to a form, including after row replacement or native reset. */
export function useFormSelectionCount(formId: string, name: string) {
  const getSnapshot = useCallback(() => {
    const form = document.getElementById(formId);
    return form instanceof HTMLFormElement ? new FormData(form).getAll(name).length : 0;
  }, [formId, name]);
  const subscribe = useCallback((notify: () => void) => {
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    const changed = (event: Event) => {
      const target = event.target;
      if ((target instanceof HTMLInputElement && target.form?.id === formId)
        || (target instanceof HTMLFormElement && target.id === formId)) notify();
    };
    const reset = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement) || event.target.id !== formId) return;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(notify, 0); // Native reset runs after the event's listeners.
    };
    document.addEventListener("change", changed);
    document.addEventListener("reset", reset);
    const observer = new MutationObserver(notify);
    const parent = document.getElementById(formId)?.parentElement;
    if (parent) observer.observe(parent, { childList: true, subtree: true, attributes: true, attributeFilter: ["checked", "disabled", "form", "name"] });
    return () => {
      clearTimeout(resetTimer);
      observer.disconnect();
      document.removeEventListener("change", changed);
      document.removeEventListener("reset", reset);
    };
  }, [formId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
