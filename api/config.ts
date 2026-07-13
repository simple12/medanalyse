import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getResolvedConnection } from "./lib/resolve-fhir-connection.js";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  try {
    const connection = getResolvedConnection(req);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      fhirSource: connection.label,
      fhirHost: connection.host,
      sourceId: connection.sourceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Config unavailable";
    res.status(500).json({ error: message });
  }
}
