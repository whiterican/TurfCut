/**
 * The flag a guard adds when it turns someone away from a page their role
 * doesn't reach, so the page they land on can say why (#113 review). It names
 * no page or area: the address bar already held that, and nothing more leaks.
 */
export const NO_ACCESS_PARAM = "noaccess";

/** `path` with the flag added, keeping any query it already has. */
export function withNoAccess(path: string): string {
  const [base, hash = ""] = path.split("#", 2);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${NO_ACCESS_PARAM}=1${hash ? `#${hash}` : ""}`;
}
