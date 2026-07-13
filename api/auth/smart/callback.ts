import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSourceById, buildSourceRegistry } from "../../../shared/fhir-sources.js";
import {
  exchangeAuthorizationCode,
  extractPatientFromTokenResponse,
  getAppBaseUrl,
  smartCallbackUrl,
} from "../../../shared/smart-oauth.js";
import {
  clearOAuthPendingCookie,
  readOAuthPending,
  readSmartSession,
  setResponseCookies,
  writeSmartSessionCookie,
  writeSourceCookie,
} from "../../../shared/smart-session.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const error = typeof req.query.error === "string" ? req.query.error : "";
    const errorDescription =
      typeof req.query.error_description === "string" ? req.query.error_description : "";
    const errorUri = typeof req.query.error_uri === "string" ? req.query.error_uri : "";
    if (error) {
      const parts = [errorDescription.trim(), errorUri.trim(), error].filter(Boolean);
      const message = parts[0] ?? error;
      res.redirect(302, `/?smart_error=${encodeURIComponent(message)}`);
      return;
    }
    if (!code) {
      res.status(400).json({ error: "Missing authorization code" });
      return;
    }

    const pending = readOAuthPending(req.headers.cookie as string | undefined);
    if (!pending) {
      res.status(400).json({ error: "OAuth session expired; try signing in again" });
      return;
    }

    const registry = buildSourceRegistry();
    const source = getSourceById(registry, pending.sourceId);
    if (!source || source.authType !== "smart") {
      res.status(400).json({ error: "Invalid SMART source" });
      return;
    }

    const appBaseUrl = getAppBaseUrl(req.headers, process.env);
    const token = await exchangeAuthorizationCode({
      source,
      issuer: pending.iss,
      redirectUri: smartCallbackUrl(appBaseUrl),
      code,
      codeVerifier: pending.codeVerifier,
    });

    const session = readSmartSession(req.headers.cookie as string | undefined);
    const patient = extractPatientFromTokenResponse(token);

    session[source.id] = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
      iss: pending.iss,
      patient,
    };

    setResponseCookies(res, [
      writeSmartSessionCookie(session),
      writeSourceCookie(source.id),
      clearOAuthPendingCookie(),
    ]);
    const redirectPath = patient ? `/patient/${patient}` : pending.redirectAfter;
    const redirectUrl = redirectPath.includes("?")
      ? `${redirectPath}&connected_source=${source.id}`
      : `${redirectPath}?connected_source=${source.id}`;
    res.redirect(302, redirectUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMART callback failed";
    res.redirect(302, `/?smart_error=${encodeURIComponent(message)}`);
  }
}
