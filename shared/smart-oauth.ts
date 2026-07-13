import type { FhirSourceConfig, FhirSourceId } from "./fhir-sources.js";
import { buildCernerAuthorizeScopes, buildEpicAuthorizeScopes } from "./fhir-sources.js";
import { generateCodeChallenge } from "./smart-session.js";

export interface SmartConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
  issuer?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  patient?: string;
  id_token?: string;
}

export async function discoverSmartConfiguration(
  issuer: string,
): Promise<SmartConfiguration> {
  const normalized = issuer.replace(/\/$/, "");
  const wellKnown = `${normalized}/.well-known/smart-configuration`;
  const response = await fetch(wellKnown);
  if (!response.ok) {
    throw new Error(`SMART discovery failed (${response.status}) for ${wellKnown}`);
  }
  const config = (await response.json()) as SmartConfiguration;
  if (!config.authorization_endpoint || !config.token_endpoint) {
    throw new Error("SMART configuration missing authorization or token endpoint");
  }
  return config;
}

function normalizeAuthorizationEndpoint(
  endpoint: string,
  sourceId: FhirSourceId,
): string {
  if (sourceId === "cerner" && endpoint.includes("/personas/provider/")) {
    return endpoint.replace("/personas/provider/", "/personas/patient/");
  }
  return endpoint;
}

export async function buildAuthorizeUrl(params: {
  source: FhirSourceConfig;
  issuer: string;
  redirectUri: string;
  codeVerifier: string;
  state: string;
  launch?: string;
}): Promise<string> {
  const smart = params.source.smart;
  if (!smart?.clientId) {
    throw new Error(`SMART client not configured for ${params.source.label}`);
  }

  const config = await discoverSmartConfiguration(params.issuer);
  const challenge = await generateCodeChallenge(params.codeVerifier);
  const url = new URL(
    normalizeAuthorizationEndpoint(config.authorization_endpoint, params.source.id),
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", smart.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set(
    "scope",
    params.source.id === "cerner"
      ? buildCernerAuthorizeScopes(smart.scopes, params.launch)
      : params.source.id === "epic"
        ? buildEpicAuthorizeScopes(smart.scopes, params.launch)
        : smart.scopes,
  );
  url.searchParams.set("state", params.state);
  url.searchParams.set("aud", params.issuer);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.launch?.trim()) {
    url.searchParams.set("launch", params.launch.trim());
    if (params.source.id === "cerner") {
      // Force Cerner to show login when switching sandbox patients (avoids SSO mismatch).
      url.searchParams.set("prompt", "login");
    }
  }
  return url.toString();
}

export function inferSmartSourceIdFromIssuer(issuer: string): FhirSourceId | null {
  try {
    const host = new URL(issuer.trim()).hostname.toLowerCase();
    if (host.includes("cerner")) return "cerner";
    if (host.includes("epic")) return "epic";
  } catch {
    return null;
  }
  return null;
}

export function normalizeSmartPatientId(patientId: string): string {
  const trimmed = patientId.trim();
  if (trimmed.startsWith("Patient/")) {
    return trimmed.slice("Patient/".length);
  }
  return trimmed;
}

export function extractPatientFromTokenResponse(token: {
  patient?: string;
  id_token?: string;
}): string | undefined {
  if (token.patient?.trim()) {
    return normalizeSmartPatientId(token.patient);
  }

  const idToken = token.id_token?.trim();
  if (!idToken) return undefined;

  const segments = idToken.split(".");
  if (segments.length < 2) return undefined;

  try {
    const payload = JSON.parse(
      Buffer.from(segments[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    if (typeof payload.patient === "string" && payload.patient.trim()) {
      return normalizeSmartPatientId(payload.patient);
    }

    if (typeof payload.fhirUser === "string" && payload.fhirUser.trim()) {
      return normalizeSmartPatientId(payload.fhirUser);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export async function exchangeAuthorizationCode(params: {
  source: FhirSourceConfig;
  issuer: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const smart = params.source.smart;
  if (!smart?.clientId) {
    throw new Error(`SMART client not configured for ${params.source.label}`);
  }

  const config = await discoverSmartConfiguration(params.issuer);
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", params.code);
  body.set("redirect_uri", params.redirectUri);
  body.set("code_verifier", params.codeVerifier);

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  const useClientSecret = Boolean(smart.clientSecret?.trim());

  if (useClientSecret) {
    const credentials = Buffer.from(`${smart.clientId}:${smart.clientSecret}`).toString(
      "base64",
    );
    headers.Authorization = `Basic ${credentials}`;
  } else {
    // Public PKCE clients identify via client_id in the body (SMART App Launch).
    body.set("client_id", smart.clientId);
  }

  const response = await fetch(config.token_endpoint, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return (await response.json()) as TokenResponse;
}

export function resolveIssuer(source: FhirSourceConfig, issuerOverride?: string): string {
  const configured = (source.smart?.issuer || source.baseUrl).replace(/\/$/, "");
  const override = issuerOverride?.trim().replace(/\/$/, "");
  if (!override) return configured;

  try {
    const overrideUrl = new URL(override);
    const configuredUrl = new URL(configured);
    const hostOnly =
      overrideUrl.hostname === configuredUrl.hostname &&
      (overrideUrl.pathname === "/" || overrideUrl.pathname === "");
    if (hostOnly) return configured;
  } catch {
    return configured;
  }

  return override;
}

export function getAppBaseUrl(
  headers: Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.APP_BASE_URL?.trim() || env.VERCEL_URL?.trim();
  if (configured) {
    return configured.startsWith("http") ? configured : `https://${configured}`;
  }
  const host = headers["x-forwarded-host"] || headers.host;
  const proto = headers["x-forwarded-proto"] || "http";
  if (typeof host === "string") {
    const scheme = typeof proto === "string" ? proto.split(",")[0] : "http";
    return `${scheme}://${host}`;
  }
  return "http://localhost:5173";
}

export function smartCallbackUrl(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/$/, "")}/api/auth/smart/callback`;
}
