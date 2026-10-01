/** Small inline icons for the chat screens (decorative; buttons carry labels). */
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const ArrowLeft = () => (
  <svg {...base}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
);
export const ArrowUp = () => (
  <svg {...base} strokeWidth={2.5}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const Paperclip = () => (
  <svg {...base}><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" /></svg>
);
export const More = () => (
  <svg {...base}><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></svg>
);
