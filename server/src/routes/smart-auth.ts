import { Router, type Request, type Response } from "express";
import {
  buildSourceRegistry,
  getSourceById,
  isSmartSourceConfigured,
  type FhirSourceId,
} from "../../../shared/fhir-sources.js";
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  extractPatientFromTokenResponse,
  getAppBaseUrl,
  inferSmartSourceIdFromIssuer,
  resolveIssuer,
  smartCallbackUrl,
} from "../../../shared/smart-oauth.js";
import {
  buildSmartLogoutCookies,
  clearOAuthPendingCookie,
  generateCodeVerifier,
  generateOAuthState,
  getSmartAccessToken,
  readOAuthPending,
  readSmartSession,
  setResponseCookies,
  writeOAuthPendingCookie,
  writeSmartSessionCookie,
  writeSourceCookie,
} from "../../../shared/smart-session.js";

const router = Router();

router.get("/launch", (req: Request, res: Response) => {
  const iss = typeof req.query.iss === "string" ? req.query.iss.trim() : "";
  const launch = typeof req.query.launch === "string" ? req.query.launch.trim() : "";
  if (!iss || !launch) {
    res.status(400).json({ error: "Missing iss or launch query parameter" });
    return;
  }

  const sourceId = inferSmartSourceIdFromIssuer(iss);
  if (!sourceId) {
    res.status(400).json({ error: "Unsupported SMART issuer for EHR launch" });
    return;
  }

  const params = new URLSearchParams({
    source: sourceId,
    iss,
    launch,
    redirect: "/",
  });
  res.redirect(`/api/auth/smart/authorize?${params.toString()}`);
});

router.get("/authorize", async (req: Request, res: Response) => {
  try {
    const sourceId = String(req.query.source ?? "") as FhirSourceId;
    const issuerOverride = typeof req.query.iss === "string" ? req.query.iss : undefined;
    const launch = typeof req.query.launch === "string" ? req.query.launch : undefined;
    const redirectAfter =
      typeof req.query.redirect === "string" && req.query.redirect.startsWith("/")
        ? req.query.redirect
        : "/";

    const registry = buildSourceRegistry();
    const source = getSourceById(registry, sourceId);
    if (!source || source.authType !== "smart" || !isSmartSourceConfigured(source)) {
      res.status(400).json({ error: "Invalid or unconfigured SMART source" });
      return;
    }

    const issuer = resolveIssuer(source, issuerOverride);
    const appBaseUrl = getAppBaseUrl(req.headers, process.env);
    const codeVerifier = generateCodeVerifier();
    const state = generateOAuthState();
    const authorizeUrl = await buildAuthorizeUrl({
      source,
      issuer,
      redirectUri: smartCallbackUrl(appBaseUrl),
      codeVerifier,
      state,
      launch,
    });

    const pendingCookie = writeOAuthPendingCookie({
      sourceId: source.id,
      codeVerifier,
      iss: issuer,
      redirectAfter,
      createdAt: Date.now(),
    });

    res.setHeader("Set-Cookie", pendingCookie);
    res.redirect(authorizeUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMART authorize failed";
    res.status(502).json({ error: message });
  }
});

router.get("/callback", async (req: Request, res: Response) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const error = typeof req.query.error === "string" ? req.query.error : "";
    const errorDescription =
      typeof req.query.error_description === "string" ? req.query.error_description : "";
    const errorUri = typeof req.query.error_uri === "string" ? req.query.error_uri : "";
    if (error) {
      const parts = [errorDescription.trim(), errorUri.trim(), error].filter(Boolean);
      const message = parts[0] ?? error;
      res.redirect(`/?smart_error=${encodeURIComponent(message)}`);
      return;
    }
    if (!code) {
      res.status(400).json({ error: "Missing authorization code" });
      return;
    }

    const pending = readOAuthPending(req.headers.cookie);
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

    const session = readSmartSession(req.headers.cookie);
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
    res.redirect(redirectUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMART callback failed";
    res.redirect(`/?smart_error=${encodeURIComponent(message)}`);
  }
});

router.get("/status", (req: Request, res: Response) => {
  const sourceId = typeof req.query.source === "string" ? req.query.source : undefined;
  const registry = buildSourceRegistry();
  const session = readSmartSession(req.headers.cookie);

  if (sourceId) {
    const source = getSourceById(registry, sourceId);
    if (!source) {
      res.status(404).json({ error: "Unknown source" });
      return;
    }
    const entry = session[source.id as FhirSourceId];
    const accessToken = getSmartAccessToken(session, source.id);
    res.json({
      sourceId: source.id,
      connected: Boolean(accessToken),
      expiresAt: entry?.expiresAt,
      patient: entry?.patient,
      iss: entry?.iss,
    });
    return;
  }

  const statuses = registry
    .filter((source) => source.authType === "smart")
    .map((source) => {
      const entry = session[source.id];
      return {
        sourceId: source.id,
        connected: Boolean(getSmartAccessToken(session, source.id)),
        expiresAt: entry?.expiresAt,
        patient: entry?.patient,
        iss: entry?.iss,
      };
    });

  res.json({ statuses });
});

router.get("/logout", (req: Request, res: Response) => {
  const redirect =
    typeof req.query.redirect === "string" && req.query.redirect.startsWith("/")
      ? req.query.redirect
      : "/";
  setResponseCookies(res, buildSmartLogoutCookies());
  res.redirect(302, redirect);
});

router.post("/logout", (req: Request, res: Response) => {
  setResponseCookies(res, buildSmartLogoutCookies());
  res.json({ ok: true });
});

export default router;
