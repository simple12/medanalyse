import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getResolvedConnection } from "../../shared/vercel-resolve-fhir-connection.js";
import { runPatientAsk } from "../../shared/agent/ask.js";
import { isAgentEnabledSource } from "../../shared/agent/fhir-reader.js";
import { resolveLlmProvider } from "../../shared/agent/llm.js";
import {
  authorizeSettingsWrite,
  isKvConfigured,
  loadLlmSettings,
  normalizeLlmSettingsInput,
  resolveEffectiveLlmSettings,
  saveLlmSettings,
} from "../../shared/agent/llm-settings.js";
import { runConditionReview } from "../../shared/agent/review.js";
import { runInteractionCheck } from "../../shared/agent/interaction-check.js";

function actionFromRequest(req: VercelRequest): string {
  const queryAction = req.query.action;
  if (typeof queryAction === "string" && queryAction.trim()) {
    return queryAction.trim();
  }
  if (Array.isArray(queryAction) && typeof queryAction[0] === "string") {
    return queryAction[0].trim();
  }

  const url = req.url || "";
  const pathOnly = url.split("?")[0] || "";
  const parts = pathOnly.split("/").filter(Boolean);
  // /api/agent/<action>
  const agentIdx = parts.indexOf("agent");
  if (agentIdx >= 0 && parts[agentIdx + 1]) {
    return parts[agentIdx + 1];
  }
  return "";
}

function readBodyObject(body: unknown): Record<string, unknown> {
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (!body || typeof body !== "object") return {};
  return body as Record<string, unknown>;
}

function readSecret(req: VercelRequest): string | undefined {
  const header = req.headers["x-agent-settings-secret"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || undefined;
  }
  return undefined;
}

async function handleReview(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const connection = getResolvedConnection(req);
  if (!isAgentEnabledSource(connection.sourceId)) {
    res.status(400).json({
      error: "Patient Intelligence is only available for Epic and Cerner sources",
    });
    return;
  }

  const body = readBodyObject(req.body);
  const patientId =
    typeof body.patientId === "string" && body.patientId.trim()
      ? body.patientId.trim()
      : undefined;
  if (!patientId) {
    res.status(400).json({ error: "patientId is required" });
    return;
  }

  const result = await runConditionReview(connection, patientId);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(result);
}

async function handleAsk(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const connection = getResolvedConnection(req);
  if (!isAgentEnabledSource(connection.sourceId)) {
    res.status(400).json({
      error: "Patient Intelligence is only available for Epic and Cerner sources",
    });
    return;
  }

  const body = readBodyObject(req.body);
  const patientId =
    typeof body.patientId === "string" && body.patientId.trim()
      ? body.patientId.trim()
      : undefined;
  const question =
    typeof body.question === "string" && body.question.trim()
      ? body.question.trim()
      : undefined;
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
}

async function handleLlmSettings(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const effective = await resolveEffectiveLlmSettings(
      process.env,
      resolveLlmProvider,
    );
    const stored = await loadLlmSettings(process.env);
    res.status(200).json({
      ...effective,
      stored,
    });
    return;
  }

  if (req.method === "PUT" || req.method === "POST") {
    if (!authorizeSettingsWrite(process.env, readSecret(req))) {
      res.status(401).json({
        error:
          "Unauthorized. Set AGENT_SETTINGS_SECRET and pass it as x-agent-settings-secret or Authorization: Bearer.",
      });
      return;
    }

    if (!isKvConfigured(process.env)) {
      res.status(503).json({
        error:
          "Vercel KV / Upstash Redis is not configured. Connect Upstash Redis to this project and redeploy once so KV_REST_API_* env vars are present.",
      });
      return;
    }

    const body = readBodyObject(req.body);
    const normalized = normalizeLlmSettingsInput(body);
    const stored = await saveLlmSettings(normalized, process.env);
    const effective = await resolveEffectiveLlmSettings(
      process.env,
      resolveLlmProvider,
    );
    res.status(200).json({ stored, effective });
    return;
  }

  res.setHeader("Allow", "GET, PUT, POST");
  res.status(405).json({ error: "Method not allowed" });
}

async function handleInteractionCheck(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const connection = getResolvedConnection(req);
  if (!isAgentEnabledSource(connection.sourceId)) {
    res.status(400).json({
      error: "Patient Intelligence is only available for Epic and Cerner sources",
    });
    return;
  }

  const body = readBodyObject(req.body);
  const patientId =
    typeof body.patientId === "string" && body.patientId.trim()
      ? body.patientId.trim()
      : undefined;
  const proposedRaw = body.proposedMedication;
  const proposedRecord =
    proposedRaw && typeof proposedRaw === "object"
      ? (proposedRaw as { rxnormCode?: unknown; display?: unknown })
      : {};
  const display =
    typeof proposedRecord.display === "string" && proposedRecord.display.trim()
      ? proposedRecord.display.trim()
      : undefined;
  const rxnormCode =
    typeof proposedRecord.rxnormCode === "string" && proposedRecord.rxnormCode.trim()
      ? proposedRecord.rxnormCode.trim()
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
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const action = actionFromRequest(req);

  try {
    if (action === "review") {
      await handleReview(req, res);
      return;
    }
    if (action === "ask") {
      await handleAsk(req, res);
      return;
    }
    if (action === "interaction-check") {
      await handleInteractionCheck(req, res);
      return;
    }
    if (action === "llm-settings") {
      await handleLlmSettings(req, res);
      return;
    }

    res.status(404).json({ error: `Unknown agent action: ${action || "(empty)"}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent request failed";
    const status = message.includes("SMART login required")
      ? 401
      : message.includes("provider must") ||
          message.includes("model must") ||
          message.includes("proposedMedication")
        ? 400
        : 502;
    res.status(status).json({ error: message });
  }
}
