import { Router, type Request, type Response } from "express";
import { getResolvedConnection } from "../lib/resolve-fhir-connection.js";
import { runPatientAsk } from "../../../shared/agent/ask.js";
import { isAgentEnabledSource } from "../../../shared/agent/fhir-reader.js";
import { runConditionReview } from "../../../shared/agent/review.js";
import { runInteractionCheck } from "../../../shared/agent/interaction-check.js";

const router = Router();

function readPatientId(body: unknown): string | undefined {
  if (body && typeof body === "object" && "patientId" in body) {
    const value = (body as { patientId?: unknown }).patientId;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
  return undefined;
}

function readQuestion(body: unknown): string | undefined {
  if (body && typeof body === "object" && "question" in body) {
    const value = (body as { question?: unknown }).question;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
  return undefined;
}

router.post("/review", async (req: Request, res: Response): Promise<void> => {
  try {
    const connection = getResolvedConnection(req);
    if (!isAgentEnabledSource(connection.sourceId)) {
      res.status(400).json({
        error: "Patient Intelligence is only available for Epic and Cerner sources",
      });
      return;
    }

    const patientId = readPatientId(req.body);
    if (!patientId) {
      res.status(400).json({ error: "patientId is required" });
      return;
    }

    const result = await runConditionReview(connection, patientId);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent review failed";
    const status = message.includes("SMART login required") ? 401 : 502;
    res.status(status).json({ error: message });
  }
});

router.post("/ask", async (req: Request, res: Response): Promise<void> => {
  try {
    const connection = getResolvedConnection(req);
    if (!isAgentEnabledSource(connection.sourceId)) {
      res.status(400).json({
        error: "Patient Intelligence is only available for Epic and Cerner sources",
      });
      return;
    }

    const patientId = readPatientId(req.body);
    const question = readQuestion(req.body);
    if (!patientId) {
      res.status(400).json({ error: "patientId is required" });
      return;
    }
    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const result = await runPatientAsk(connection, patientId, question, process.env);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent ask failed";
    const status = message.includes("SMART login required") ? 401 : 502;
    res.status(status).json({ error: message });
  }
});

router.post("/interaction-check", async (req: Request, res: Response): Promise<void> => {
  try {
    const connection = getResolvedConnection(req);
    if (!isAgentEnabledSource(connection.sourceId)) {
      res.status(400).json({
        error: "Patient Intelligence is only available for Epic and Cerner sources",
      });
      return;
    }

    const patientId = readPatientId(req.body);
    const proposed =
      req.body && typeof req.body === "object"
        ? (req.body as { proposedMedication?: { rxnormCode?: unknown; display?: unknown } })
            .proposedMedication
        : undefined;
    const display =
      typeof proposed?.display === "string" && proposed.display.trim()
        ? proposed.display.trim()
        : undefined;
    const rxnormCode =
      typeof proposed?.rxnormCode === "string" && proposed.rxnormCode.trim()
        ? proposed.rxnormCode.trim()
        : undefined;

    if (!patientId) {
      res.status(400).json({ error: "patientId is required" });
      return;
    }
    if (!display && !rxnormCode) {
      res.status(400).json({
        error: "proposedMedication.display or proposedMedication.rxnormCode is required",
      });
      return;
    }

    const result = await runInteractionCheck(connection, patientId, {
      display: display || rxnormCode || "Unknown medication",
      rxnormCode,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Interaction check failed";
    const status = message.includes("SMART login required")
      ? 401
      : message.includes("proposedMedication")
        ? 400
        : 502;
    res.status(status).json({ error: message });
  }
});

router.get("/graph-status", async (req: Request, res: Response): Promise<void> => {
  try {
    const connection = getResolvedConnection(req);
    if (!isAgentEnabledSource(connection.sourceId)) {
      res.status(400).json({
        error: "Patient Intelligence is only available for Epic and Cerner sources",
      });
      return;
    }
    const patientId =
      typeof req.query.patientId === "string" && req.query.patientId.trim()
        ? req.query.patientId.trim()
        : undefined;
    if (!patientId) {
      res.status(400).json({ error: "patientId is required" });
      return;
    }
    const { isGraphDbConfigured } = await import("../../../shared/agent/db.js");
    const { canEmbed } = await import("../../../shared/agent/embeddings.js");
    const { getPatientSyncMeta } = await import("../../../shared/agent/graph-sync.js");
    const meta = await getPatientSyncMeta(connection.sourceId, patientId, process.env);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      configured: isGraphDbConfigured(process.env),
      canEmbed: canEmbed(process.env),
      sourceId: connection.sourceId,
      patientId,
      sync: meta
        ? {
            syncedAt: meta.syncedAt.toISOString(),
            chunkCount: meta.chunkCount,
            nodeCount: meta.nodeCount,
          }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load graph status";
    const status = message.includes("SMART login required") ? 401 : 502;
    res.status(status).json({ error: message });
  }
});

router.post("/graph-status", async (req: Request, res: Response): Promise<void> => {
  try {
    const connection = getResolvedConnection(req);
    if (!isAgentEnabledSource(connection.sourceId)) {
      res.status(400).json({
        error: "Patient Intelligence is only available for Epic and Cerner sources",
      });
      return;
    }
    const patientId = readPatientId(req.body);
    if (!patientId) {
      res.status(400).json({ error: "patientId is required" });
      return;
    }
    const force =
      req.body && typeof req.body === "object" && (req.body as { force?: unknown }).force === true;
    const { fetchPatientClinicalData } = await import(
      "../../../shared/agent/fhir-reader.js"
    );
    const { assessConditionControl } = await import(
      "../../../shared/agent/condition-control.js"
    );
    const { syncPatientGraph } = await import("../../../shared/agent/graph-sync.js");
    const clinical = await fetchPatientClinicalData(connection, patientId);
    const assessments = assessConditionControl(
      clinical.conditions,
      clinical.observations,
      clinical.medications,
    );
    const result = await syncPatientGraph(
      {
        sourceId: connection.sourceId,
        patientId,
        conditions: clinical.conditions,
        observations: clinical.observations,
        medications: clinical.medications,
        assessments,
      },
      process.env,
      { force },
    );
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Graph sync failed";
    const status = message.includes("SMART login required") ? 401 : 502;
    res.status(status).json({ error: message });
  }
});

function readSettingsSecret(req: Request): string | undefined {
  const header = req.header("x-agent-settings-secret");
  if (header?.trim()) return header.trim();
  const auth = req.header("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || undefined;
  }
  return undefined;
}

router.get("/llm-settings", async (_req: Request, res: Response): Promise<void> => {
  try {
    const { resolveLlmProvider } = await import("../../../shared/agent/llm.js");
    const {
      loadLlmSettings,
      resolveEffectiveLlmSettings,
    } = await import("../../../shared/agent/llm-settings.js");
    const effective = await resolveEffectiveLlmSettings(
      process.env,
      resolveLlmProvider,
    );
    const stored = await loadLlmSettings(process.env);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ ...effective, stored });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load LLM settings";
    res.status(500).json({ error: message });
  }
});

router.put("/llm-settings", async (req: Request, res: Response): Promise<void> => {
  await writeLlmSettings(req, res);
});

router.post("/llm-settings", async (req: Request, res: Response): Promise<void> => {
  await writeLlmSettings(req, res);
});

async function writeLlmSettings(req: Request, res: Response): Promise<void> {
  try {
    const {
      authorizeSettingsWrite,
      isKvConfigured,
      normalizeLlmSettingsInput,
      resolveEffectiveLlmSettings,
      saveLlmSettings,
    } = await import("../../../shared/agent/llm-settings.js");
    const { resolveLlmProvider } = await import("../../../shared/agent/llm.js");

    if (!authorizeSettingsWrite(process.env, readSettingsSecret(req))) {
      res.status(401).json({
        error:
          "Unauthorized. Set AGENT_SETTINGS_SECRET and pass it as x-agent-settings-secret or Authorization: Bearer.",
      });
      return;
    }
    if (!isKvConfigured(process.env)) {
      res.status(503).json({
        error:
          "Vercel KV / Upstash Redis is not configured. Connect Upstash Redis to this project and redeploy once so KV credentials are present.",
      });
      return;
    }

    const normalized = normalizeLlmSettingsInput(req.body ?? {});
    const stored = await saveLlmSettings(normalized, process.env);
    const effective = await resolveEffectiveLlmSettings(
      process.env,
      resolveLlmProvider,
    );
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ stored, effective });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save LLM settings";
    const status =
      message.includes("provider must") || message.includes("model must")
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
}

export default router;
