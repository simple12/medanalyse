import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildSmartLogoutCookies,
  setResponseCookies,
} from "../../../shared/smart-session.js";

function resolveRedirect(req: VercelRequest): string {
  const redirect =
    typeof req.query.redirect === "string" ? req.query.redirect.trim() : "/";
  return redirect.startsWith("/") ? redirect : "/";
}

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  setResponseCookies(res, buildSmartLogoutCookies());

  if (req.method === "GET") {
    res.redirect(302, resolveRedirect(req));
    return;
  }

  res.status(200).json({ ok: true });
}
