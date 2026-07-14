import type { VercelRequest } from "@vercel/node";
import {
  buildSourceRegistry,
  getSourceById,
  readSourceIdFromRequest,
  resolveConnection,
  type ResolvedFhirConnection,
} from "./fhir-sources.js";
import { getSmartAccessToken, readSmartSession } from "./smart-session.js";

export function getActiveSourceId(req: VercelRequest): string | undefined {
  return readSourceIdFromRequest(req.headers, req.headers.cookie as string | undefined);
}

export function getResolvedConnection(req: VercelRequest): ResolvedFhirConnection {
  const registry = buildSourceRegistry();
  if (registry.length === 0) {
    throw new Error("No FHIR sources configured");
  }

  const source = getSourceById(registry, getActiveSourceId(req));
  if (!source) {
    throw new Error("Unknown FHIR source");
  }

  const session = readSmartSession(req.headers.cookie as string | undefined);
  const sessionEntry = source.authType === "smart" ? session[source.id] : undefined;
  const smartToken = sessionEntry ? getSmartAccessToken(session, source.id) : undefined;

  return resolveConnection(source, smartToken, sessionEntry?.iss);
}
