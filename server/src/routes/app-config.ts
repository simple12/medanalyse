import { Router, type Request, type Response } from "express";
import { getResolvedConnection } from "../lib/resolve-fhir-connection.js";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  try {
    const connection = getResolvedConnection(req);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      fhirSource: connection.label,
      fhirHost: connection.host,
      sourceId: connection.sourceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Config unavailable";
    res.status(500).json({ error: message });
  }
});

export default router;
