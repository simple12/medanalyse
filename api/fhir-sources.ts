import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildSourceRegistry,
  listPublicSources,
} from "../shared/fhir-sources.js";
import { getSmartAccessToken, readSmartSession } from "../shared/smart-session.js";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  const registry = buildSourceRegistry();
  const session = readSmartSession(req.headers.cookie as string | undefined);
  const connected = new Set(
    registry
      .filter((source) => source.authType === "smart" && getSmartAccessToken(session, source.id))
      .map((source) => source.id),
  );

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ sources: listPublicSources(registry, connected) });
}
