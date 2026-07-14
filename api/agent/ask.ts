import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getResolvedConnection } from "../lib/resolve-fhir-connection.js";
import { runPatientAsk } from "../../shared/agent/ask.js";
import { isAgentEnabledSource } from "../../shared/agent/fhir-reader.js";

function readBody(body: unknown): { patientId?: string; question?: string } {
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (!body || typeof body !== "object") return {};
  const record = body as { patientId?: unknown; question?: unknown };
  return {
    patientId:
      typeof record.patientId === "string" && record.patientId.trim()
        ? record.patientId.trim()
        : undefined,
    question:
      typeof record.question === "string" && record.question.trim()
        ? record.question.trim()
        : undefined,
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const connection = getResolvedConnection(req);
    if (!isAgentEnabledSource(connection.sourceId)) {
      res.status(400).json({
        error: "Patient Intelligence is only available for Epic and Cerner sources",
      });
      return;
    }

    const { patientId, question } = readBody(req.body);
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
}
