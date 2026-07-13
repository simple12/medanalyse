import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildSourceRegistry, getSourceById } from "../../../shared/fhir-sources.js";
import { getSmartAccessToken, readSmartSession } from "../../../shared/smart-session.js";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const sourceId = typeof req.query.source === "string" ? req.query.source : undefined;
  const registry = buildSourceRegistry();
  const session = readSmartSession(req.headers.cookie as string | undefined);

  if (sourceId) {
    const source = getSourceById(registry, sourceId);
    if (!source) {
      res.status(404).json({ error: "Unknown source" });
      return;
    }
    const entry = session[source.id as keyof typeof session];
    const accessToken = getSmartAccessToken(session, source.id);
    res.status(200).json({
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

  res.status(200).json({ statuses });
}
