import type { FhirSourceId } from "@/types/fhir-source";
import { FHIR_SOURCE_STORAGE_KEY } from "@/types/fhir-source";

let activeSourceId: FhirSourceId | null = null;

export function getActiveFhirSourceId(): FhirSourceId | null {
  return activeSourceId;
}

export function setActiveFhirSourceId(sourceId: FhirSourceId): void {
  activeSourceId = sourceId;
  localStorage.setItem(FHIR_SOURCE_STORAGE_KEY, sourceId);
}

export function loadStoredFhirSourceId(): FhirSourceId | null {
  const stored = localStorage.getItem(FHIR_SOURCE_STORAGE_KEY);
  if (
    stored === "hapi" ||
    stored === "medblocks" ||
    stored === "cerner" ||
    stored === "epic"
  ) {
    return stored;
  }
  return null;
}

export function clearStoredFhirSourceId(): void {
  localStorage.removeItem(FHIR_SOURCE_STORAGE_KEY);
  activeSourceId = null;
}
