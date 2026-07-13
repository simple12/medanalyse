import type { VercelRequest, VercelResponse } from "@vercel/node";
import { inferSmartSourceIdFromIssuer } from "../../../shared/smart-oauth.js";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const iss = typeof req.query.iss === "string" ? req.query.iss.trim() : "";
  const launch = typeof req.query.launch === "string" ? req.query.launch.trim() : "";
  if (!iss || !launch) {
    res.status(400).json({ error: "Missing iss or launch query parameter" });
    return;
  }

  const sourceId = inferSmartSourceIdFromIssuer(iss);
  if (!sourceId) {
    res.status(400).json({ error: "Unsupported SMART issuer for EHR launch" });
    return;
  }

  const params = new URLSearchParams({
    source: sourceId,
    iss,
    launch,
    redirect: "/",
  });
  res.redirect(302, `/api/auth/smart/authorize?${params.toString()}`);
}
