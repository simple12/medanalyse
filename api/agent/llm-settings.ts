import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveLlmProvider } from "../../shared/agent/llm.js";
import {
  authorizeSettingsWrite,
  isKvConfigured,
  loadLlmSettings,
  normalizeLlmSettingsInput,
  resolveEffectiveLlmSettings,
  saveLlmSettings,
} from "../../shared/agent/llm-settings.js";

function readSecret(req: VercelRequest): string | undefined {
  const header = req.headers["x-agent-settings-secret"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || undefined;
  }
  return undefined;
}

function readBody(body: unknown): { provider?: unknown; model?: unknown } {
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (!body || typeof body !== "object") return {};
  const record = body as { provider?: unknown; model?: unknown };
  return {
    provider: record.provider,
    model: record.model,
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    try {
      const effective = await resolveEffectiveLlmSettings(
        process.env,
        resolveLlmProvider,
      );
      const stored = await loadLlmSettings(process.env);
      res.status(200).json({
        ...effective,
        stored,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load LLM settings";
      res.status(500).json({ error: message });
    }
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

    try {
      const body = readBody(req.body);
      const normalized = normalizeLlmSettingsInput(body);
      const stored = await saveLlmSettings(normalized, process.env);
      const effective = await resolveEffectiveLlmSettings(
        process.env,
        resolveLlmProvider,
      );
      res.status(200).json({ stored, effective });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save LLM settings";
      const status = message.includes("provider must") || message.includes("model must")
        ? 400
        : 500;
      res.status(status).json({ error: message });
    }
    return;
  }

  res.setHeader("Allow", "GET, PUT, POST");
  res.status(405).json({ error: "Method not allowed" });
}
