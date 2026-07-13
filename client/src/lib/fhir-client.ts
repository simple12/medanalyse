import type {
  FhirBundle,
  FhirCondition,
  FhirMedication,
  FhirMedicationRequest,
  FhirObservation,
  FhirPatient,
  FhirPractitioner,
  FhirResource,
  OperationOutcome,
} from "@/types/fhir";
import { getCodeableConceptLabel } from "@/lib/fhir-clinical";
import { getActiveFhirSourceId } from "@/lib/fhir-source-storage";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export class FhirApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FhirApiError";
    this.status = status;
  }
}

async function parseError(response: Response): Promise<string> {
  const text = await response.text();
  if (text.includes("insufficient_scope")) {
    return `${text.trim()} — sign out and sign in again if you recently updated SMART API scopes.`;
  }
  if (response.status === 404) {
    return `${text.trim() || "Resource not found"} — sign out and sign in again if this persists after a deploy.`;
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return `FHIR request timed out (${response.status}). Try refreshing; Cerner sandbox can be slow.`;
  }
  try {
    const json = JSON.parse(text) as OperationOutcome & {
      error?: { code?: string; message?: string };
    };
    if (json.error?.message) {
      return `FHIR request failed (${response.status}): ${json.error.message}`;
    }
    if (json.resourceType === "OperationOutcome" && json.issue?.length) {
      return (
        json.issue[0].diagnostics ||
        json.issue[0].details?.text ||
        `Request failed (${response.status})`
      );
    }
    return text || `Request failed (${response.status})`;
  } catch {
    return text || `Request failed (${response.status})`;
  }
}

async function fhirFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const sourceId = getActiveFhirSourceId();
  const response = await fetch(`${API_BASE}/api/fhir${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/fhir+json",
      "Content-Type": "application/fhir+json",
      ...(sourceId ? { "X-FHIR-Source": sourceId } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new FhirApiError(await parseError(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function resourcesFromBundle<T extends FhirResource>(bundle: FhirBundle, type: string): T[] {
  const resources = (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((r): r is T => r?.resourceType === type);

  return dedupeResourcesById(resources);
}

function resourceLastUpdated(resource: FhirResource): string | undefined {
  const meta = resource.meta as { lastUpdated?: string } | undefined;
  return meta?.lastUpdated;
}

function dedupeResourcesById<T extends FhirResource>(resources: T[]): T[] {
  const byId = new Map<string, T>();
  const withoutId: T[] = [];

  for (const resource of resources) {
    if (!resource.id) {
      withoutId.push(resource);
      continue;
    }
    const existing = byId.get(resource.id);
    if (!existing) {
      byId.set(resource.id, resource);
      continue;
    }
    const existingUpdated = resourceLastUpdated(existing);
    const nextUpdated = resourceLastUpdated(resource);
    if (nextUpdated && (!existingUpdated || nextUpdated > existingUpdated)) {
      byId.set(resource.id, resource);
    }
  }

  return [...byId.values(), ...withoutId];
}

export async function searchResources<T extends FhirResource>(
  resourceType: string,
  params: Record<string, string>
): Promise<T[]> {
  const query = new URLSearchParams(params).toString();
  const bundle = await fhirFetch<FhirBundle>(`/${resourceType}?${query}`);
  return resourcesFromBundle<T>(bundle, resourceType);
}

export async function listPatients(name?: string): Promise<FhirPatient[]> {
  const query = name?.trim() ? `?name=${encodeURIComponent(name.trim())}` : "";
  const bundle = await fhirFetch<FhirBundle>(`/Patient${query}`);
  return resourcesFromBundle<FhirPatient>(bundle, "Patient");
}

export async function getPatient(id: string): Promise<FhirPatient> {
  return fhirFetch<FhirPatient>(`/Patient/${encodeURIComponent(id)}`);
}

export async function getPractitioner(id: string): Promise<FhirPractitioner> {
  return fhirFetch<FhirPractitioner>(`/Practitioner/${encodeURIComponent(id)}`);
}

export async function createPatient(patient: FhirPatient): Promise<FhirPatient> {
  return fhirFetch<FhirPatient>("/Patient", {
    method: "POST",
    body: JSON.stringify(patient),
  });
}

export async function updatePatient(patient: FhirPatient): Promise<FhirPatient> {
  if (!patient.id) {
    throw new Error("Patient id is required for update");
  }
  return fhirFetch<FhirPatient>(`/Patient/${encodeURIComponent(patient.id)}`, {
    method: "PUT",
    body: JSON.stringify(patient),
  });
}

export async function deletePatient(id: string): Promise<void> {
  await fhirFetch<void>(`/Patient/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function deleteFhirResource(resourceType: string, id: string): Promise<void> {
  await fhirFetch<void>(`/${resourceType}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getAllObservationsForPatient(patientId: string): Promise<FhirObservation[]> {
  if (getActiveFhirSourceId() === "epic") {
    return searchEpicObservations(patientId, 500);
  }
  return searchResources<FhirObservation>("Observation", {
    subject: `Patient/${patientId}`,
    _count: "500",
  });
}

function filterQuantitativeObservations(observations: FhirObservation[]): FhirObservation[] {
  return observations.filter(
    (obs) =>
      obs.valueQuantity?.value !== undefined ||
      obs.component?.some((part) => part.valueQuantity?.value !== undefined),
  );
}

async function searchEpicObservations(
  patientId: string,
  maxCount: number,
): Promise<FhirObservation[]> {
  const categories = ["vital-signs", "laboratory"];
  const merged = new Map<string, FhirObservation>();
  let lastError: unknown;

  for (const category of categories) {
    try {
      const observations = await searchResources<FhirObservation>("Observation", {
        patient: patientId,
        category,
        _sort: "-date",
        _count: String(maxCount),
      });
      for (const obs of observations) {
        if (obs.id) merged.set(obs.id, obs);
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (merged.size > 0) {
    return [...merged.values()];
  }
  if (lastError) throw lastError;
  return [];
}

export async function getObservationsForPatient(patientId: string): Promise<FhirObservation[]> {
  if (getActiveFhirSourceId() === "epic") {
    return filterQuantitativeObservations(await searchEpicObservations(patientId, 100));
  }

  const subject = `Patient/${patientId}`;
  const observations = await searchResources<FhirObservation>("Observation", {
    subject,
    _sort: "-date",
    _count: "100",
  });

  return filterQuantitativeObservations(observations);
}

export async function getConditionsForPatient(patientId: string): Promise<FhirCondition[]> {
  if (getActiveFhirSourceId() === "epic") {
    return searchResources<FhirCondition>("Condition", {
      patient: patientId,
      _count: "25",
    });
  }

  const attempts: Array<Record<string, string>> = [
    { patient: patientId, _count: "25" },
    { patient: patientId, _count: "10" },
    { subject: `Patient/${patientId}`, _count: "10" },
  ];

  let lastError: unknown;
  for (const params of attempts) {
    try {
      return await searchResources<FhirCondition>("Condition", params);
    } catch (err) {
      lastError = err;
      if (err instanceof FhirApiError && [502, 503, 504].includes(err.status)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to load conditions");
}

function medicationReferenceId(reference: string): string | null {
  const trimmed = reference.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("Medication/")) {
    return trimmed.slice("Medication/".length) || null;
  }
  return trimmed;
}

function indexBundleMedications(bundle: FhirBundle): Map<string, FhirMedication> {
  const medications = new Map<string, FhirMedication>();
  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource;
    if (resource?.resourceType !== "Medication" || !resource.id) continue;
    const medication = resource as FhirMedication;
    medications.set(`Medication/${resource.id}`, medication);
    medications.set(resource.id, medication);
  }
  return medications;
}

function medicationRequestHasLabel(request: FhirMedicationRequest): boolean {
  if (getCodeableConceptLabel(request.medicationCodeableConcept)) return true;
  if (request.medicationCodeableConcept?.coding?.[0]?.code?.trim()) return true;
  if (request.medicationReference?.display?.trim()) return true;
  return false;
}

function labelFromMedicationResource(medication?: FhirMedication): string | undefined {
  if (!medication?.code) return undefined;
  return (
    getCodeableConceptLabel(medication.code) ?? medication.code.coding?.[0]?.code?.trim() ?? undefined
  );
}

function enrichMedicationRequest(
  request: FhirMedicationRequest,
  medications: Map<string, FhirMedication>,
): FhirMedicationRequest {
  if (medicationRequestHasLabel(request)) return request;

  const reference = request.medicationReference?.reference?.trim();
  if (!reference) return request;

  const medication =
    medications.get(reference) ??
    medications.get(medicationReferenceId(reference) ?? "") ??
    undefined;
  const label = labelFromMedicationResource(medication);
  if (!label) return request;

  return {
    ...request,
    medicationCodeableConcept: {
      text: label,
      coding: [{ display: label }],
    },
  };
}

export async function getMedication(id: string): Promise<FhirMedication> {
  return fhirFetch<FhirMedication>(`/Medication/${encodeURIComponent(id)}`);
}

export async function getMedicationRequestsForPatient(
  patientId: string,
): Promise<FhirMedicationRequest[]> {
  const params = new URLSearchParams({
    patient: patientId,
    _count: "100",
    _include: "MedicationRequest:medication",
  });
  const bundle = await fhirFetch<FhirBundle>(`/MedicationRequest?${params}`);
  const requests = resourcesFromBundle<FhirMedicationRequest>(bundle, "MedicationRequest");
  const medications = indexBundleMedications(bundle);

  let enriched = requests.map((request) => enrichMedicationRequest(request, medications));

  const unresolvedIds = [
    ...new Set(
      enriched
        .filter((request) => !medicationRequestHasLabel(request))
        .map((request) => request.medicationReference?.reference)
        .filter((reference): reference is string => Boolean(reference))
        .map((reference) => medicationReferenceId(reference))
        .filter((id): id is string => Boolean(id))
        .filter((id) => !medications.has(id)),
    ),
  ];

  if (unresolvedIds.length > 0) {
    const fetched = await Promise.allSettled(unresolvedIds.map((id) => getMedication(id)));
    for (let index = 0; index < unresolvedIds.length; index += 1) {
      const result = fetched[index];
      if (result.status !== "fulfilled" || !result.value.id) continue;
      medications.set(result.value.id, result.value);
      medications.set(`Medication/${result.value.id}`, result.value);
    }
    enriched = enriched.map((request) => enrichMedicationRequest(request, medications));
  }

  return enriched;
}
