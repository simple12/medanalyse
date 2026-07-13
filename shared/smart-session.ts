import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FhirSourceId } from "./fhir-sources.js";

export interface SmartTokenEntry {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  iss: string;
  patient?: string;
}

export type SmartSessionStore = Partial<Record<FhirSourceId, SmartTokenEntry>>;

export interface OAuthPendingState {
  sourceId: FhirSourceId;
  codeVerifier: string;
  iss: string;
  redirectAfter: string;
  createdAt: number;
}

const SESSION_COOKIE = "fhir_smart_session";
const OAUTH_COOKIE = "fhir_oauth_pending";
const SOURCE_COOKIE = "fhir_source";

function getSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.SMART_SESSION_SECRET?.trim() || env.FHIR_ACCESS_TOKEN?.trim();
  if (!secret) {
    return "dev-only-smart-session-secret-change-me";
  }
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function encodeSigned<T>(value: T, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

function decodeSigned<T>(token: string, secret: string): T | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  const a = new Uint8Array(Buffer.from(signature));
  const b = new Uint8Array(Buffer.from(expected));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    }),
  );
}

export function serializeCookie(
  name: string,
  value: string,
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    path?: string;
    sameSite?: "Lax" | "Strict";
    secure?: boolean;
  } = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`Path=${options.path ?? "/"}`);
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function useSecureCookies(env: NodeJS.ProcessEnv = process.env): boolean {
  const base = env.APP_BASE_URL?.trim() || env.VERCEL_URL?.trim();
  if (!base) return env.VERCEL === "1";
  const normalized = base.startsWith("http") ? base : `https://${base}`;
  try {
    return new URL(normalized).protocol === "https:";
  } catch {
    return false;
  }
}

export function setResponseCookies(
  res: {
    setHeader: (name: string, value: string | string[]) => void;
    appendHeader?: (name: string, value: string) => void;
  },
  cookies: string[],
): void {
  if (cookies.length === 0) return;
  if (typeof res.appendHeader === "function") {
    for (const cookie of cookies) {
      res.appendHeader("Set-Cookie", cookie);
    }
    return;
  }
  res.setHeader("Set-Cookie", cookies.length === 1 ? cookies[0] : cookies);
}

export function readSmartSession(
  cookieHeader: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): SmartSessionStore {
  const cookies = parseCookies(cookieHeader);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return {};
  return decodeSigned<SmartSessionStore>(raw, getSecret(env)) ?? {};
}

export function writeSmartSessionCookie(
  session: SmartSessionStore,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const maxAge = 60 * 60 * 8;
  return serializeCookie(SESSION_COOKIE, encodeSigned(session, getSecret(env)), {
    maxAge,
    httpOnly: true,
    secure: useSecureCookies(env),
  });
}

export function clearSmartSessionCookie(env: NodeJS.ProcessEnv = process.env): string {
  return serializeCookie(SESSION_COOKIE, "", {
    maxAge: 0,
    httpOnly: true,
    secure: useSecureCookies(env),
  });
}

export function writeSourceCookie(sourceId: FhirSourceId, env: NodeJS.ProcessEnv = process.env): string {
  return serializeCookie(SOURCE_COOKIE, sourceId, {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: false,
    secure: useSecureCookies(env),
  });
}

export function clearSourceCookie(env: NodeJS.ProcessEnv = process.env): string {
  return serializeCookie(SOURCE_COOKIE, "", {
    maxAge: 0,
    httpOnly: false,
    secure: useSecureCookies(env),
  });
}

export function readOAuthPending(
  cookieHeader: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): OAuthPendingState | null {
  const cookies = parseCookies(cookieHeader);
  const raw = cookies[OAUTH_COOKIE];
  if (!raw) return null;
  const state = decodeSigned<OAuthPendingState>(raw, getSecret(env));
  if (!state) return null;
  if (Date.now() - state.createdAt > 10 * 60 * 1000) return null;
  return state;
}

export function writeOAuthPendingCookie(
  state: OAuthPendingState,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return serializeCookie(OAUTH_COOKIE, encodeSigned(state, getSecret(env)), {
    maxAge: 600,
    httpOnly: true,
    secure: useSecureCookies(env),
  });
}

export function clearOAuthPendingCookie(env: NodeJS.ProcessEnv = process.env): string {
  return serializeCookie(OAUTH_COOKIE, "", {
    maxAge: 0,
    httpOnly: true,
    secure: useSecureCookies(env),
  });
}

/** Clears all SMART auth cookies. Prefer this on sign-out to avoid stale partial state. */
export function buildSmartLogoutCookies(env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    clearSmartSessionCookie(env),
    clearSourceCookie(env),
    clearOAuthPendingCookie(env),
  ];
}

export function getSmartAccessToken(
  session: SmartSessionStore,
  sourceId: FhirSourceId,
): string | undefined {
  const entry = session[sourceId];
  if (!entry) return undefined;
  if (entry.expiresAt && Date.now() >= entry.expiresAt) {
    return undefined;
  }
  return entry.accessToken;
}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(verifier).digest("base64url");
}

export function generateOAuthState(): string {
  return randomBytes(16).toString("base64url");
}
