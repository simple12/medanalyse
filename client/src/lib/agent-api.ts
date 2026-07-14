import type { AskResult, InteractionCheckResult, ReviewResult } from "@/types/agent";
import { getActiveFhirSourceId } from "@/lib/fhir-source-storage";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export class AgentApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error?: string };
    if (json.error) return json.error;
  } catch {
    // fall through
  }
  return `Agent request failed (${response.status})`;
}

function agentHeaders(): HeadersInit {
  const sourceId = getActiveFhirSourceId();
  return {
    "Content-Type": "application/json",
    ...(sourceId ? { "X-FHIR-Source": sourceId } : {}),
  };
}

export async function requestConditionReview(patientId: string): Promise<ReviewResult> {
  const sourceId = getActiveFhirSourceId();
  const response = await fetch(`${API_BASE}/api/agent/review`, {
    method: "POST",
    credentials: "include",
    headers: agentHeaders(),
    body: JSON.stringify({ patientId, sourceId }),
  });

  if (!response.ok) {
    throw new AgentApiError(await parseError(response), response.status);
  }

  return (await response.json()) as ReviewResult;
}

export async function requestPatientAsk(
  patientId: string,
  question: string,
): Promise<AskResult> {
  const sourceId = getActiveFhirSourceId();
  const response = await fetch(`${API_BASE}/api/agent/ask`, {
    method: "POST",
    credentials: "include",
    headers: agentHeaders(),
    body: JSON.stringify({ patientId, sourceId, question }),
  });

  if (!response.ok) {
    throw new AgentApiError(await parseError(response), response.status);
  }

  return (await response.json()) as AskResult;
}

export async function requestInteractionCheck(
  patientId: string,
  proposedMedication: { rxnormCode?: string; display: string },
): Promise<InteractionCheckResult> {
  const sourceId = getActiveFhirSourceId();
  const response = await fetch(`${API_BASE}/api/agent/interaction-check`, {
    method: "POST",
    credentials: "include",
    headers: agentHeaders(),
    body: JSON.stringify({ patientId, sourceId, proposedMedication }),
  });

  if (!response.ok) {
    throw new AgentApiError(await parseError(response), response.status);
  }

  return (await response.json()) as InteractionCheckResult;
}
