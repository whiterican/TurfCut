/**
 * Inline script that runs during HTML parsing, before first paint (see
 * next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
 * `text/plain` on the client stops React's dev warning about <script> tags.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
