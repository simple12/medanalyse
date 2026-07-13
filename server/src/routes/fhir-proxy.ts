import { Router, type Request, type Response } from "express";
import { getResolvedConnection } from "../lib/resolve-fhir-connection.js";

const router = Router();

function buildTargetUrl(req: Request, baseUrl: string): string {
  const targetPath = req.path || "/";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((v) => {
        if (typeof v === "string") params.append(key, v);
      });
    }
  }
  const query = params.toString();
  return `${baseUrl}${targetPath}${query ? `?${query}` : ""}`;
}

function buildHeaders(req: Request, accessToken?: string): Headers {
  const headers = new Headers();
  const contentType = req.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  headers.set("Accept", req.get("accept") || "application/fhir+json");
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

async function proxyRequest(req: Request, res: Response): Promise<void> {
  try {
    const connection = getResolvedConnection(req);
    const targetUrl = buildTargetUrl(req, connection.baseUrl);
    const headers = buildHeaders(req, connection.accessToken);

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
      init.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, init);
    const body = await response.text();

    const responseContentType = response.headers.get("content-type");
    if (responseContentType) {
      res.setHeader("Content-Type", responseContentType);
    }

    res.status(response.status).send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy request failed";
    const status = message.includes("SMART login required") ? 401 : 502;
    res.status(status).json({
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", diagnostics: message }],
    });
  }
}

router.all("/*", proxyRequest);

export default router;
