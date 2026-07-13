import { Router, type Request, type Response } from "express";
import {
  buildSourceRegistry,
  listPublicSources,
} from "../../../shared/fhir-sources.js";
import { getSmartAccessToken, readSmartSession } from "../../../shared/smart-session.js";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  const registry = buildSourceRegistry();
  const session = readSmartSession(_req.headers.cookie);
  const connected = new Set(
    registry
      .filter((source) => source.authType === "smart" && getSmartAccessToken(session, source.id))
      .map((source) => source.id),
  );

  res.setHeader("Cache-Control", "no-store");
  res.json({ sources: listPublicSources(registry, connected) });
});

export default router;
