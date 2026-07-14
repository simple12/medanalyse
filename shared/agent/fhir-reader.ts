/**
 * Server-side FHIR reader for the agent.
 * Given a resolved connection (baseUrl + optional bearer token from the same
 * resolver the FHIR proxy uses), fetches resources for the condition-control engine.
 * Read-only.
 */

import type { FhirSourceId, ResolvedFhirConnection } from "../fhir-sources.js";
import type {
  FhirAllergyIntolerance,
  FhirBundle,
  FhirCondition,
  FhirMedicationRequest,
  FhirObservation,
} from "./fhir.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface PatientClinicalData {
  conditions: FhirCondition[];
  observations: FhirObservation[];
  medications: FhirMedicationRequest[];
  allergies: FhirAllergyIntolerance[];
  allergiesUnavailable: boolean;
}

async function fhirSearch<T>(
  connection: ResolvedFhirConnection,
  resourceType: string,
  params: Record<string, string>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T[]> {
  const query = new URLSearchParams(params).toString();
  const url = `${connection.baseUrl}/${resourceType}?${query}`;

  const headers = new Headers();
  headers.set("Accept", "application/fhir+json");
  if (connection.accessToken) {
    headers.set("Authorization", `Bearer ${connection.accessToken}`);
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AgentFhirError(
      `FHIR ${resourceType} search failed (${response.status}): ${text.slice(0, 200)}`,
      response.status,
    );
  }

  const bundle = (await response.json()) as FhirBundle;
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is T & { resourceType: string } =>
      Boolean(resource && resource.resourceType === resourceType),
    ) as T[];
}

export class AgentFhirError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AgentFhirError";
    this.status = status;
  }
}

function isQuantitative(obs: FhirObservation): boolean {
  return (
    obs.valueQuantity?.value !== undefined ||
    Boolean(obs.component?.some((part) => part.valueQuantity?.value !== undefined))
  );
}

/**
 * Epic needs patient + category searches.
 * Other sources typically accept subject=Patient/{id}.
 */
async function fetchObservations(
  connection: ResolvedFhirConnection,
  patientId: string,
): Promise<FhirObservation[]> {
  if (connection.sourceId === "epic") {
    const categories = ["vital-signs", "laboratory"];
    const merged = new Map<string, FhirObservation>();

    await Promise.all(
      categories.map(async (category) => {
        try {
          const observations = await fhirSearch<FhirObservation>(connection, "Observation", {
            patient: patientId,
            category,
            _sort: "-date",
            _count: "200",
          });
          for (const obs of observations) {
            if (obs.id) merged.set(obs.id, obs);
          }
        } catch {
          // Partial failure: keep results from the other category.
        }
      }),
    );

    return [...merged.values()].filter(isQuantitative);
  }

  try {
    const observations = await fhirSearch<FhirObservation>(connection, "Observation", {
      subject: `Patient/${patientId}`,
      _sort: "-date",
      _count: "200",
    });
    return observations.filter(isQuantitative);
  } catch {
    return [];
  }
}

async function fetchConditions(
  connection: ResolvedFhirConnection,
  patientId: string,
): Promise<FhirCondition[]> {
  try {
    return await fhirSearch<FhirCondition>(connection, "Condition", {
      patient: patientId,
      _count: "50",
    });
  } catch {
    if (connection.sourceId === "epic") return [];
    try {
      return await fhirSearch<FhirCondition>(connection, "Condition", {
        subject: `Patient/${patientId}`,
        _count: "50",
      });
    } catch {
      return [];
    }
  }
}

async function fetchAllergies(
  connection: ResolvedFhirConnection,
  patientId: string,
): Promise<{ allergies: FhirAllergyIntolerance[]; unavailable: boolean }> {
  try {
    const allergies = await fhirSearch<FhirAllergyIntolerance>(
      connection,
      "AllergyIntolerance",
      {
        patient: patientId,
        _count: "50",
      },
    );
    return { allergies, unavailable: false };
  } catch {
    return { allergies: [], unavailable: true };
  }
}

/**
 * Fetch conditions, quantitative observations, and medication requests for a patient.
 * Each read is independent so the review can still run on partial data.
 */
export async function fetchPatientClinicalData(
  connection: ResolvedFhirConnection,
  patientId: string,
): Promise<PatientClinicalData> {
  const [conditions, observations, medications, allergyResult] = await Promise.all([
    fetchConditions(connection, patientId),
    fetchObservations(connection, patientId),
    fhirSearch<FhirMedicationRequest>(connection, "MedicationRequest", {
      patient: patientId,
      _count: "100",
    }).catch(() => [] as FhirMedicationRequest[]),
    fetchAllergies(connection, patientId),
  ]);

  return {
    conditions,
    observations,
    medications,
    allergies: allergyResult.allergies,
    allergiesUnavailable: allergyResult.unavailable,
  };
}

/** Sources that arm Journey A / Patient Intelligence in Phase 1. */
export const AGENT_ENABLED_SOURCES: ReadonlySet<FhirSourceId> = new Set(["epic", "cerner"]);

export function isAgentEnabledSource(sourceId: string): sourceId is FhirSourceId {
  return AGENT_ENABLED_SOURCES.has(sourceId as FhirSourceId);
}
