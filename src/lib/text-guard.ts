/**
 * Characters that make typed text render as something else, or carry text
 * nobody can see: controls, zero-width and joiners, direction overrides and
 * isolates, line and paragraph separators, the soft hyphen, filler and
 * Hangul blank characters, the BOM, and Unicode tag characters (which can
 * smuggle invisible ASCII). Anything a worker types for others to read is
 * checked against this. Allowed on purpose: the zero-width joiner and
 * non-joiner and variation selectors, which emoji (❤️, 👩‍👧) and scripts such
 * as Persian need, and which can't flip direction or hide text.
 */
export const HIDDEN_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b\u200e\u200f\u2028-\u202e\u2060-\u206f\u3164\ufeff\uffa0\u{e0000}-\u{e007f}]/u;

/** Tab and line breaks: refused in one-line fields. */
const BREAKS = /[\t\n\r]/;

export const hasHiddenChars = (s: string, oneLine = false) => HIDDEN_CHARS.test(s) || (oneLine && BREAKS.test(s));
