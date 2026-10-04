/**
 * Validation for the auth forms. Pure, so it's tested without Supabase.
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** US-first phone normaliser: 10 digits (or 11 starting with 1) → +1XXXXXXXXXX. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Only same-site paths may be used as a post-login destination. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/(?!\/)[\w\-/?=&%.]*$/.test(next) ? next : "/dashboard";
}

export interface SignupFields {
  accountType: "worker" | "company";
  name: string;
  email: string;
  password: string;
  phone: string | null;
}

export function validateSignup(raw: Record<string, unknown>): { ok: true; value: SignupFields } | { ok: false; errors: Record<string, string> } {
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  const setup = validateSetup(raw);
  const errors: Record<string, string> = setup.ok ? {} : { ...setup.errors };
  const email = s("email").toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  const password = typeof raw.password === "string" ? raw.password : "";
  if (password.length < 8) errors.password = "Use at least 8 characters.";
  return setup.ok && !Object.keys(errors).length ? { ok: true, value: { ...setup.value, email, password } } : { ok: false, errors };
}

export type SetupFields = Pick<SignupFields, "accountType" | "name" | "phone">;

/** Account type, name and phone: what sign-up asks for besides the login itself. */
export function validateSetup(raw: Record<string, unknown>): { ok: true; value: SetupFields } | { ok: false; errors: Record<string, string> } {
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  const errors: Record<string, string> = {};
  const accountType = s("accountType") === "company" ? "company" : "worker";
  const name = s("name").replace(/\s+/g, " ");
  if (!name) errors.name = accountType === "worker" ? "Enter your name." : "Enter your company's name.";
  else if (name.length > 100) errors.name = "Keep it under 100 characters.";
  let phone: string | null = null;
  if (accountType === "worker" && s("phone")) {
    phone = normalizePhone(s("phone"));
    if (!phone) errors.phone = "Enter a 10-digit US mobile number, or leave it blank.";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { accountType, name, phone } };
}
