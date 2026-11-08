"use client";

import { useEffect, useRef, useState, type SelectHTMLAttributes } from "react";

/** Keep the native picker; repeat a clipped selection as wrapping text below it. */
export function ReadableSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const select = useRef<HTMLSelectElement>(null);
  const [clippedLabel, setClippedLabel] = useState("");

  useEffect(() => {
    const control = select.current;
    if (!control) return;
    let active = true;
    const context = document.createElement("canvas").getContext("2d");
    const measure = () => {
      if (!active || !context || !control.clientWidth) return;
      const style = getComputedStyle(control);
      context.font = style.font;
      const text = control.selectedOptions[0]?.text ?? "";
      const spacing = parseFloat(style.letterSpacing) || 0;
      const width = context.measureText(text).width + Math.max(0, text.length - 1) * spacing;
      // Native picker arrows vary by browser. Reserve 24px beyond the padding,
      // conservatively showing the full value before it could be obscured.
      const available = control.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 24;
      setClippedLabel(width > available ? text : "");
    };
    const observer = new ResizeObserver(measure);
    observer.observe(control); // Also measures when its builder step becomes visible.
    control.addEventListener("change", measure);
    const afterReset = () => queueMicrotask(measure);
    const form = control.form;
    form?.addEventListener("reset", afterReset);
    document.fonts.addEventListener("loadingdone", measure);
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
      control.removeEventListener("change", measure);
      form?.removeEventListener("reset", afterReset);
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, []);

  return (
    <>
      <select {...props} ref={select} />
      {/* The native option already exposes the full text to assistive technology. */}
      {clippedLabel && <span aria-hidden="true" className="text-hint block break-words">{clippedLabel}</span>}
    </>
  );
}
