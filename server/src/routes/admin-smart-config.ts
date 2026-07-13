import { Router, type Request, type Response } from "express";
import {
  buildSourceRegistry,
  getSourceById,
  isSmartSourceConfigured,
  type FhirSourceId,
} from "../../../shared/fhir-sources.js";
import { setSmartSourceOverride } from "../../../shared/smart-source-overrides.js";
import {
  canConfigureViaVercel,
  configureSmartSourceOnVercel,
  getDeploymentStatus,
} from "../../../shared/vercel-admin.js";

const router = Router();

interface ConfigureBody {
  source?: FhirSourceId;
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
}

function isSmartSourceId(value: string): value is "cerner" | "epic" {
  return value === "cerner" || value === "epic";
}

function validateBody(body: ConfigureBody) {
  const sourceId = String(body.source ?? "");
  if (!isSmartSourceId(sourceId)) {
    throw new Error("source must be cerner or epic");
  }

  const clientId = body.clientId?.trim();
  const clientSecret = body.clientSecret?.trim();
  const issuer = body.issuer?.trim();

  if (!clientId || !issuer) {
    throw new Error("clientId and issuer are required");
  }

  try {
    const parsed = new URL(issuer);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("issuer must use http or https");
    }
  } catch {
    throw new Error("issuer must be a valid URL");
  }

  return { sourceId, clientId, clientSecret: clientSecret || undefined, issuer };
}

function canConfigureSource(
  sourceId: "cerner" | "epic",
  setupSecretHeader: string | undefined,
): boolean {
  const registry = buildSourceRegistry();
  const source = getSourceById(registry, sourceId);
  if (!source) return false;

  if (!isSmartSourceConfigured(source)) {
    return true;
  }

  const configuredSecret = process.env.SMART_SETUP_SECRET?.trim();
  if (configuredSecret) {
    return setupSecretHeader === configuredSecret;
  }
  return true;
}

router.get("/configure-smart-source", async (req: Request, res: Response) => {
  const deploymentId = typeof req.query.deploymentId === "string" ? req.query.deploymentId : "";
  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();

  if (!deploymentId || !token) {
    res.status(400).json({ error: "deploymentId and VERCEL_TOKEN are required" });
    return;
  }

  try {
    const deployment = await getDeploymentStatus(token, deploymentId, teamId);
    res.json({
      deploymentId: deployment.id,
      readyState: deployment.readyState,
      deploymentUrl: deployment.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load deployment status";
    res.status(502).json({ error: message });
  }
});

router.post("/configure-smart-source", async (req: Request, res: Response) => {
  try {
    const credentials = validateBody(req.body as ConfigureBody);

    if (!canConfigureSource(credentials.sourceId, req.header("x-setup-secret"))) {
      res.status(403).json({
        error:
          "SMART source is already configured. Provide X-Setup-Secret to update credentials.",
      });
      return;
    }

    if (canConfigureViaVercel(process.env)) {
      const result = await configureSmartSourceOnVercel(credentials.sourceId, credentials, process.env);
      res.status(202).json({
        ...result,
        message:
          "Credentials saved to Vercel. A production redeploy is in progress — this usually takes 1–2 minutes.",
      });
      return;
    }

    setSmartSourceOverride(credentials.sourceId, credentials);
    res.json({
      mode: "local",
      message: "Credentials applied for this server session. You can sign in with SMART now.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to configure SMART source";
    res.status(400).json({ error: message });
  }
});

export default router;
