import {
  deletePatient,
  getAllObservationsForPatient,
  getConditionsForPatient,
  getMedicationRequestsForPatient,
  getPatient,
  getPractitioner,
  deleteFhirResource,
} from "@/lib/fhir-client";
import type {
  FhirBundle,
  FhirCondition,
  FhirMedicationRequest,
  FhirObservation,
  FhirPatient,
  FhirPractitioner,
  FhirResource,
} from "@/types/fhir";

export type PatientAssociatedResources = {
  patient: FhirPatient;
  practitioner?: FhirPractitioner;
  observations: FhirObservation[];
  conditions: FhirCondition[];
  medicationRequests: FhirMedicationRequest[];
};

function practitionerIdFromPatient(patient: FhirPatient): string | undefined {
  const ref = patient.generalPractitioner?.[0]?.reference;
  if (!ref?.startsWith("Practitioner/")) return undefined;
  return ref.replace("Practitioner/", "");
}

export async function fetchPatientAssociatedResources(
  patientId: string
): Promise<PatientAssociatedResources> {
  const [patient, observations, conditions, medicationRequests] = await Promise.all([
    getPatient(patientId),
    getAllObservationsForPatient(patientId),
    getConditionsForPatient(patientId),
    getMedicationRequestsForPatient(patientId),
  ]);

  let practitioner: FhirPractitioner | undefined;
  const practId = practitionerIdFromPatient(patient);
  if (practId) {
    try {
      practitioner = await getPractitioner(practId);
    } catch {
      practitioner = undefined;
    }
  }

  return { patient, practitioner, observations, conditions, medicationRequests };
}

export function buildPatientExportBundle(resources: PatientAssociatedResources): FhirBundle {
  const ordered: FhirResource[] = [
    resources.patient,
    ...(resources.practitioner ? [resources.practitioner] : []),
    ...resources.observations,
    ...resources.conditions,
    ...resources.medicationRequests,
  ];

  return {
    resourceType: "Bundle",
    type: "collection",
    total: ordered.length,
    entry: ordered.map((resource) => ({ resource })),
  };
}

export async function copyPatientBundleToClipboard(patientId: string): Promise<number> {
  const resources = await fetchPatientAssociatedResources(patientId);
  const bundle = buildPatientExportBundle(resources);
  const json = JSON.stringify(bundle, null, 2);
  await navigator.clipboard.writeText(json);
  return bundle.total ?? bundle.entry?.length ?? 0;
}

async function deleteResourcesByType(resources: FhirResource[], resourceType: string): Promise<void> {
  for (const resource of resources) {
    if (resource.id) {
      await deleteFhirResource(resourceType, resource.id);
    }
  }
}

/** Deletes observations, conditions, medication requests, then the patient. Practitioner is not deleted. */
export async function deletePatientAndDependents(patientId: string): Promise<{
  observations: number;
  conditions: number;
  medicationRequests: number;
}> {
  const { observations, conditions, medicationRequests } =
    await fetchPatientAssociatedResources(patientId);

  await deleteResourcesByType(observations, "Observation");
  await deleteResourcesByType(conditions, "Condition");
  await deleteResourcesByType(medicationRequests, "MedicationRequest");
  await deletePatient(patientId);

  return {
    observations: observations.length,
    conditions: conditions.length,
    medicationRequests: medicationRequests.length,
  };
}
