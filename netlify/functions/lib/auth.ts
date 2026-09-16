// Google ID token verification + signed session cookie.
// No google-auth lib: we call Google's tokeninfo endpoint, which returns the
// verified payload (signature/issuer/audience/expiry are checked server-side
// by Google). We then enforce aud == GOOGLE_CLIENT_ID and email == owner.
import jwt from "jsonwebtoken";

export const COOKIE_NAME = "olive_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

// In-memory rate limiter. Resets on cold start — acceptable: Google-signed
// tokens can't be brute-forced, this is just a DoS guard against hammering
// tokeninfo. A cold start "unlocks" an IP, but Google's tokeninfo has its
// own quota, and the endpoint can't mint a session without a real ID token.
const failures = new Map<string, number[]>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;

export function checkRate(ip: string): boolean {
  const now = Date.now();
  const arr = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(ip, arr);
  return arr.length < MAX_ATTEMPTS;
}
export function recordFailure(ip: string) {
  const now = Date.now();
  const arr = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  failures.set(ip, arr);
}
export function clearFailures(ip: string) {
  failures.delete(ip);
}

function sessionSecret(): string {
  const s = process.env.OLIVE_SESSION_SECRET;
  if (!s) throw new Error("OLIVE_SESSION_SECRET not set");
  return s;
}

export function issueSession(): string {
  return jwt.sign({ sub: "owner" }, sessionSecret(), {
    algorithm: "HS256",
    expiresIn: SESSION_MAX_AGE_S,
  });
}

export function validSession(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    jwt.verify(value, sessionSecret(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}

export function sessionCookieHeader(value: string, secure = true): string {
  const attrs = [
    `${COOKIE_NAME}=${value}`,
    `Max-Age=${SESSION_MAX_AGE_S}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearCookieHeader(secure = true): string {
  const attrs = [
    `${COOKIE_NAME}=`,
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export async function verifyGoogleIdToken(credential: string): Promise<{
  ok: boolean;
  email?: string;
  emailVerified?: boolean;
  aud?: string;
  reason?: string;
}> {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
  const r = await fetch(url);
  if (!r.ok) return { ok: false, reason: `tokeninfo ${r.status}` };
  const info: any = await r.json();
  const aud = info.aud;
  const email = info.email;
  const emailVerified = info.email_verified === true || info.email_verified === "true";
  const expectedAud = process.env.GOOGLE_CLIENT_ID;
  if (!expectedAud) return { ok: false, reason: "GOOGLE_CLIENT_ID not set" };
  if (aud !== expectedAud) return { ok: false, aud, email, reason: "aud mismatch" };
  return { ok: true, email, emailVerified, aud };
}
