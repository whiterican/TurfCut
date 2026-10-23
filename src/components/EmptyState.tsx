/**
 * An empty state (P1.2): a small line illustration, a title, a sentence, and
 * any next steps. The art is decorative (aria-hidden); the words carry the
 * meaning. Colours come from the theme tokens, so each drawing works in light
 * and dark.
 */
export type EmptyArtKind = "jobs" | "shifts" | "messages" | "earnings" | "applicants" | "campaigns" | "notices" | "offline";

export const EMPTY_ART_KINDS: readonly EmptyArtKind[] = ["jobs", "shifts", "messages", "earnings", "applicants", "campaigns", "notices", "offline"];

const ART: Record<EmptyArtKind, React.ReactNode> = {
  // A map pin standing on a route, nothing on the route yet.
  jobs: (
    <>
      <path className="dim" d="M14 74c14-10 26 2 40-6s18-14 30-12" />
      <circle className="lime" cx="48" cy="40" r="19" />
      <path className="ink" d="M48 62c-9-10-17-18-17-26a17 17 0 0 1 34 0c0 8-8 16-17 26z" />
      <circle className="ink paper" cx="48" cy="36" r="6" />
      <path className="ink" d="M44 36l3 3 5-6" />
    </>
  ),
  // A calendar page with a sun rising over it.
  shifts: (
    <>
      <circle className="lime" cx="66" cy="28" r="12" />
      <path className="dim" d="M66 8v6M80 14l-4 4M86 28h-6" />
      <rect className="ink paper" x="16" y="30" width="54" height="46" rx="8" />
      <path className="ink" d="M16 44h54M28 24v10M58 24v10" />
      <path className="dim" d="M28 56h8M44 56h8M28 66h8" />
    </>
  ),
  // Two speech bubbles, the near one lime.
  messages: (
    <>
      <path className="dim" d="M26 22h40a10 10 0 0 1 10 10v12a10 10 0 0 1-10 10H46l-12 10v-10h-8a10 10 0 0 1-10-10V32a10 10 0 0 1 10-10z" />
      <path className="lime" d="M20 46h36a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8H38l-10 8v-8h-8a8 8 0 0 1-8-8V54a8 8 0 0 1 8-8z" />
      <path className="ink" d="M20 46h36a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8H38l-10 8v-8h-8a8 8 0 0 1-8-8V54a8 8 0 0 1 8-8z" />
      <path className="ink" d="M28 59h20M28 65h12" />
    </>
  ),
  // A wallet with a coin coming in.
  earnings: (
    <>
      <rect className="ink paper" x="14" y="32" width="60" height="42" rx="8" />
      <path className="ink" d="M14 42h60M22 32v-4a6 6 0 0 1 6-6h30" />
      <rect className="lime" x="54" y="50" width="26" height="14" rx="5" />
      <rect className="ink" x="54" y="50" width="26" height="14" rx="5" />
      <circle className="ink" cx="66" cy="57" r="2.5" />
      <circle className="dim" cx="76" cy="20" r="7" />
      <path className="dim" d="M76 16v8M73 20h6" />
    </>
  ),
  // An empty seat beside a person.
  applicants: (
    <>
      <circle className="ink paper" cx="36" cy="32" r="11" />
      <path className="ink" d="M16 72c0-12 9-20 20-20s20 8 20 20" />
      <circle className="dim" cx="66" cy="36" r="9" />
      <path className="dim" d="M54 70c0-9 5-15 12-15s12 6 12 15" />
      <circle className="lime" cx="74" cy="22" r="9" />
      <path className="ink" d="M74 17v10M69 22h10" />
    </>
  ),
  // A flag on a pole, lime field.
  campaigns: (
    <>
      <path className="ink" d="M26 80V16" />
      <path className="lime" d="M26 20c12-8 22 6 36 0 6-3 8-4 10-4v30c-2 0-4 1-10 4-14 6-24-8-36 0z" />
      <path className="ink" d="M26 20c12-8 22 6 36 0 6-3 8-4 10-4v30c-2 0-4 1-10 4-14 6-24-8-36 0z" />
      <path className="dim" d="M14 82h36" />
    </>
  ),
  // A bell at rest.
  notices: (
    <>
      <path className="lime" d="M48 18a20 20 0 0 1 20 20v12l8 10H20l8-10V38a20 20 0 0 1 20-20z" />
      <path className="ink" d="M48 18a20 20 0 0 1 20 20v12l8 10H20l8-10V38a20 20 0 0 1 20-20zM48 12v6M40 68a8 8 0 0 0 16 0" />
      <path className="dim" d="M78 26l6-4M18 26l-6-4" />
    </>
  ),
  // The pin with its signal arcs dimmed.
  offline: (
    <>
      <path className="dim" d="M30 30a26 26 0 0 1 36 0M22 22a38 38 0 0 1 52 0" />
      <circle className="lime" cx="48" cy="52" r="17" />
      <path className="ink" d="M48 80c-10-11-18-19-18-28a18 18 0 0 1 36 0c0 9-8 17-18 28z" />
      <path className="ink" d="M41 49l14 8M55 49l-14 8" />
      <path className="dim" d="M20 84h56" />
    </>
  ),
};

export function EmptyArt({ kind }: { kind: EmptyArtKind }) {
  return (
    <svg className="empty-art" viewBox="0 0 96 96" aria-hidden="true" focusable="false" data-art={kind}>
      {ART[kind]}
    </svg>
  );
}

export function EmptyState({
  art,
  title,
  children,
  actions,
}: {
  art?: EmptyArtKind;
  title: React.ReactNode;
  /** The sentence under the title. */
  children?: React.ReactNode;
  /** Next steps: links or buttons, laid out in a centred row. */
  actions?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      {art && <EmptyArt kind={art} />}
      <p className="empty-state-title">{title}</p>
      {children && <p className="empty-state-body">{children}</p>}
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
