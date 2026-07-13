import type { Request } from "express";
import {
  buildSourceRegistry,
  getSourceById,
  readSourceIdFromRequest,
  resolveConnection,
  type ResolvedFhirConnection,
} from "../../../shared/fhir-sources.js";
import { getSmartAccessToken, readSmartSession } from "../../../shared/smart-session.js";

export function getActiveSourceId(req: Request): string | undefined {
  return readSourceIdFromRequest(req.headers, req.headers.cookie);
}

export function getResolvedConnection(req: Request): ResolvedFhirConnection {
  const registry = buildSourceRegistry();
  if (registry.length === 0) {
    throw new Error("No FHIR sources configured");
  }

  const source = getSourceById(registry, getActiveSourceId(req));
  if (!source) {
    throw new Error("Unknown FHIR source");
  }

  const session = readSmartSession(req.headers.cookie);
  const sessionEntry = source.authType === "smart" ? session[source.id] : undefined;
  const smartToken = sessionEntry ? getSmartAccessToken(session, source.id) : undefined;

  return resolveConnection(source, smartToken, sessionEntry?.iss);
}
