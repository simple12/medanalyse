import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getResolvedConnection } from "../lib/resolve-fhir-connection.js";
import { isAgentEnabledSource } from "../../shared/agent/fhir-reader.js";
import { runConditionReview } from "../../shared/agent/review.js";

function readPatientId(body: unknown): string | undefined {
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return undefined;
    }
  }
  if (body && typeof body === "object" && "patientId" in body) {
    const value = (body as { patientId?: unknown }).patientId;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
  return undefined;
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
}
