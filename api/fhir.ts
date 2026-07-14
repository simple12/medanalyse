import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buffer } from "node:stream/consumers";
import { getResolvedConnection } from "../shared/vercel-resolve-fhir-connection.js";

function extractFhirPath(req: VercelRequest): string {
  const routed = req.query.__path;
  if (typeof routed === "string" && routed.length > 0) {
    return routed.startsWith("/") ? routed : `/${routed}`;
  }
  if (Array.isArray(routed) && routed.length > 0) {
    return `/${routed.join("/")}`;
  }

  const requestPath = (req.url ?? "").split("?")[0] ?? "";
  const prefix = "/api/fhir";
  if (requestPath.startsWith(prefix)) {
    const remainder = requestPath.slice(prefix.length);
    return remainder || "/";
  }

  return "/";
}

function buildQueryString(req: VercelRequest): string {
  const requestPath = req.url ?? "";
  const queryIndex = requestPath.indexOf("?");
  if (queryIndex === -1) return "";

  const params = new URLSearchParams(requestPath.slice(queryIndex + 1));
  for (const key of [...params.keys()]) {
    if (key === "__path" || key === "path" || key === "...path") {
      params.delete(key);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function readRequestBody(req: VercelRequest): Promise<string | undefined> {
  const parsed = req.body;
  if (parsed !== undefined && parsed !== null) {
    if (Buffer.isBuffer(parsed)) {
      const text = parsed.toString("utf8");
      return text || undefined;
    }
    if (typeof parsed === "string") {
      return parsed || undefined;
    }
    if (typeof parsed === "object") {
      return JSON.stringify(parsed);
    }
  }

  try {
    const raw = await buffer(req);
    return raw.length > 0 ? raw.toString("utf8") : undefined;
  } catch {
    return undefined;
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  try {
    const connection = getResolvedConnection(req);
    const fhirPath = extractFhirPath(req);
    const targetUrl = `${connection.baseUrl}${fhirPath}${buildQueryString(req)}`;

    const headers = new Headers();
    const contentType = req.headers["content-type"];
    if (typeof contentType === "string") {
      headers.set("Content-Type", contentType);
    }
    headers.set(
      "Accept",
      (req.headers.accept as string) ?? "application/fhir+json",
    );
    if (connection.accessToken) {
      headers.set("Authorization", `Bearer ${connection.accessToken}`);
    }

    const init: RequestInit = {
      method: req.method,
      headers,
      signal: AbortSignal.timeout(20_000),
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const body = await readRequestBody(req);
      if (body !== undefined) {
        init.body = body;
      }
    }

    const upstream = await fetch(targetUrl, init);
    const body = await upstream.text();

    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType) {
      res.setHeader("Content-Type", upstreamContentType);
    }

    res.status(upstream.status).send(body);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Proxy request failed";
    if (error instanceof Error && error.name === "TimeoutError") {
      res.status(504).json({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", diagnostics: "FHIR upstream request timed out" }],
      });
      return;
    }
    const status = message.includes("SMART login required") ? 401 : 502;
    res.status(status).json({
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", diagnostics: message }],
    });
  }
}
