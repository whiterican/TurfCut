import { linkParts } from "@/lib/campaign-social";

/**
 * A campaign's own words, verbatim: line breaks kept, web links clickable,
 * nothing else interpreted (no HTML, no markdown). Links open in a new tab
 * and pass no referrer or opener.
 */
export function LinkedText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={`whitespace-pre-line break-words ${className ?? ""}`}>
      {linkParts(text).map((p, i) =>
        p.kind === "link" ? (
          <a key={i} href={p.href} className="link" target="_blank" rel="noopener noreferrer nofollow ugc">
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </p>
  );
}
