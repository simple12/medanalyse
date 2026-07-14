/**
 * Minimal FHIR R4 shapes the agent needs on the backend.
 * The client keeps its own copy in client/src/types/fhir.ts; this is the
 * server-side subset used by the condition-control engine and FHIR reader.
 */

export interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

export interface CodeableConcept {
  text?: string;
  coding?: Coding[];
}

export interface Reference {
  reference?: string;
  display?: string;
}

export interface Quantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
}

export interface ObservationComponent {
  code?: CodeableConcept;
  valueQuantity?: Quantity;
}

export interface FhirObservation {
  resourceType: "Observation";
  id?: string;
  status?: string;
  code?: CodeableConcept;
  subject?: Reference;
  effectiveDateTime?: string;
  effectivePeriod?: { start?: string; end?: string };
  valueQuantity?: Quantity;
  component?: ObservationComponent[];
}

export interface FhirCondition {
  resourceType: "Condition";
  id?: string;
  code?: CodeableConcept;
  clinicalStatus?: CodeableConcept;
  subject?: Reference;
  onsetDateTime?: string;
  onsetPeriod?: { start?: string; end?: string };
}

export interface FhirMedicationRequest {
  resourceType: "MedicationRequest";
  id?: string;
  status?: string;
  authoredOn?: string;
  subject?: Reference;
  medicationCodeableConcept?: CodeableConcept;
  medicationReference?: Reference;
  reasonCode?: CodeableConcept[];
  reasonReference?: Reference[];
}

export interface FhirAllergyIntolerance {
  resourceType: "AllergyIntolerance";
  id?: string;
  clinicalStatus?: CodeableConcept;
  verificationStatus?: CodeableConcept;
  code?: CodeableConcept;
  patient?: Reference;
  reaction?: Array<{
    manifestation?: CodeableConcept[];
    severity?: string;
  }>;
}

export interface FhirBundleEntry {
  resource?: { resourceType?: string; [key: string]: unknown };
}

export interface FhirBundle {
  resourceType: "Bundle";
  type?: string;
  total?: number;
  entry?: FhirBundleEntry[];
}

export function loincCodes(concept?: CodeableConcept): string[] {
  if (!concept?.coding) return [];
  return concept.coding
    .filter((c) => c.system?.toLowerCase().includes("loinc"))
    .map((c) => c.code)
    .filter((code): code is string => Boolean(code));
}

export function conceptLabel(concept?: CodeableConcept): string | undefined {
  return (
    concept?.text?.trim() ||
    concept?.coding?.find((c) => c.display?.trim())?.display?.trim() ||
    concept?.coding?.[0]?.code?.trim() ||
    undefined
  );
}

export function observationDate(obs: FhirObservation): string {
  return obs.effectiveDateTime ?? obs.effectivePeriod?.start ?? "";
}

export function isActiveCondition(condition: FhirCondition): boolean {
  const status = condition.clinicalStatus?.coding?.[0]?.code?.toLowerCase();
  // Treat missing status as active; only exclude explicitly resolved/inactive.
  if (!status) return true;
  return !["resolved", "inactive", "remission", "entered-in-error"].includes(status);
}

export function medicationNameFromRequest(med: FhirMedicationRequest): string {
  return (
    conceptLabel(med.medicationCodeableConcept) ??
    med.medicationReference?.display?.trim() ??
    "Unknown medication"
  );
}
