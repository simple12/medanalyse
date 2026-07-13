import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildSourceRegistry,
  getSourceById,
  isSmartSourceConfigured,
  type FhirSourceId,
} from "../../../shared/fhir-sources.js";
import {
  buildAuthorizeUrl,
  getAppBaseUrl,
  resolveIssuer,
  smartCallbackUrl,
} from "../../../shared/smart-oauth.js";
import {
  generateCodeVerifier,
  generateOAuthState,
  writeOAuthPendingCookie,
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

    res.setHeader("Set-Cookie", writeOAuthPendingCookie({
      sourceId: source.id,
      codeVerifier,
      iss: issuer,
      redirectAfter,
      createdAt: Date.now(),
    }));
    res.redirect(302, authorizeUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMART authorize failed";
    res.status(502).json({ error: message });
  }
}
