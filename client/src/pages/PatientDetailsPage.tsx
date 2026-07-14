import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ConditionsTable } from "@/components/ConditionsTable";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MedicationsTable } from "@/components/MedicationsTable";
import { MedicationOrderDraft } from "@/components/MedicationOrderDraft";
import { PatientIntelligenceCard } from "@/components/PatientIntelligenceCard";
import { VitalsSection } from "@/components/VitalsSection";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FhirApiError,
  getConditionsForPatient,
  getMedicationRequestsForPatient,
  getObservationsForPatient,
  getPatient,
  getPractitioner,
} from "@/lib/fhir-client";
import {
  formatPractitionerName,
  parseObservations,
  prepareMedicationRequestsForDisplay,
} from "@/lib/fhir-clinical";
import {
  formatGender,
  formatPatientName,
} from "@/lib/fhir-patient";
import { useFhirSource } from "@/lib/fhir-source-context";
import type {
  FhirCondition,
  FhirMedicationRequest,
  FhirPatient,
} from "@/types/fhir";

export function PatientDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { sourceVersion, sourceId } = useFhirSource();
  const [patient, setPatient] = useState<FhirPatient | null>(null);
  const [practitionerName, setPractitionerName] = useState<string | null>(null);
  const [conditions, setConditions] = useState<FhirCondition[]>([]);
  const [medications, setMedications] = useState<FhirMedicationRequest[]>([]);
  const [vitals, setVitals] = useState<ReturnType<typeof parseObservations> | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [loadingVitals, setLoadingVitals] = useState(true);
  const [loadingConditions, setLoadingConditions] = useState(true);
  const [loadingMedications, setLoadingMedications] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeNotice, setScopeNotice] = useState<string | null>(null);
  const skippedSectionsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!id) {
      setError("Patient id is required");
      setLoadingPatient(false);
      setLoadingVitals(false);
      setLoadingConditions(false);
      setLoadingMedications(false);
      return;
    }

    let cancelled = false;

    const patientId = id;

    function noteSkippedSection(issue?: string) {
      if (!issue || cancelled) return;
      skippedSectionsRef.current = [...skippedSectionsRef.current, issue];
      const scopeHint =
        sourceId === "cerner" && skippedSectionsRef.current.some((item) => item.includes("conditions"))
          ? " Cerner Condition search is often slow in the sandbox."
          : sourceId === "epic"
            ? " Add the missing APIs on fhir.epic.com, save, wait ~30 minutes, then sign out and sign in again."
            : "";
      setScopeNotice(
        `Some sections could not be loaded: ${skippedSectionsRef.current.join(", ")}.${scopeHint}`,
      );
    }

    async function loadOptional<T>(
      label: string,
      loader: () => Promise<T>,
    ): Promise<{ data?: T; issue?: string }> {
      try {
        return { data: await loader() };
      } catch (err) {
        if (err instanceof FhirApiError) {
          if (err.status === 403 || err.message.toLowerCase().includes("insufficient_scope")) {
            return { issue: `${label} (missing scope)` };
          }
          if (err.status === 502 || err.status === 503 || err.status === 504) {
            return { issue: `${label} (timed out)` };
          }
        }
        throw err;
      }
    }

    async function load() {
      setLoadingPatient(true);
      setLoadingVitals(true);
      setLoadingConditions(true);
      setLoadingMedications(true);
      setError(null);
      setScopeNotice(null);
      skippedSectionsRef.current = [];
      setPatient(null);
      setConditions([]);
      setMedications([]);
      setVitals(null);
      setPractitionerName(null);

      try {
        const patientData = await getPatient(patientId);
        if (cancelled) return;
        setPatient(patientData);
        setLoadingPatient(false);

        const gpRef = patientData.generalPractitioner?.[0]?.reference;
        const practitionerPromise =
          gpRef?.startsWith("Practitioner/")
            ? getPractitioner(gpRef.replace("Practitioner/", ""))
                .then((pract) => {
                  if (!cancelled) {
                    setPractitionerName(formatPractitionerName(pract));
                  }
                })
                .catch(() => {
                  if (!cancelled) setPractitionerName(null);
                })
            : Promise.resolve();

        void Promise.all([
          loadOptional("vitals", () => getObservationsForPatient(patientId)).then((result) => {
            if (cancelled) return;
            if (result.data) {
              setVitals(parseObservations(result.data));
            } else {
              setVitals(parseObservations([]));
              noteSkippedSection(result.issue);
            }
            setLoadingVitals(false);
          }),
          loadOptional("medications", () => getMedicationRequestsForPatient(patientId)).then(
            (result) => {
              if (cancelled) return;
              if (result.data) {
                setMedications(prepareMedicationRequestsForDisplay(result.data));
              }
              noteSkippedSection(result.issue);
              setLoadingMedications(false);
            },
          ),
          loadOptional("conditions", () => getConditionsForPatient(patientId)).then((result) => {
            if (cancelled) return;
            if (result.data) {
              setConditions(result.data);
            }
            noteSkippedSection(result.issue);
            setLoadingConditions(false);
          }),
          practitionerPromise,
        ]);
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof FhirApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Failed to load patient details";
          setError(message);
          setLoadingPatient(false);
          setLoadingVitals(false);
          setLoadingConditions(false);
          setLoadingMedications(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, sourceVersion, sourceId]);

  if (!id) {
    return (
      <div className="space-y-4">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to list
        </Link>
        <p className="text-muted-foreground">Invalid patient id.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" />
        Back to list
      </Link>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {scopeNotice ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {scopeNotice}
        </div>
      ) : null}

      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Demographics</h2>
        {loadingPatient ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : patient ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Full name</dt>
              <dd className="font-medium">{formatPatientName(patient)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Gender</dt>
              <dd className="font-medium">{formatGender(patient.gender)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Date of birth</dt>
              <dd className="font-medium">{patient.birthDate ?? "—"}</dd>
            </div>
            {practitionerName && (
              <div>
                <dt className="text-sm text-muted-foreground">General practitioner</dt>
                <dd className="font-medium">{practitionerName}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-muted-foreground">Patient not found.</p>
        )}
      </section>

      {(sourceId === "epic" || sourceId === "cerner") && patient ? (
        <PatientIntelligenceCard patientId={id} reloadKey={sourceVersion} />
      ) : null}

      {loadingVitals ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <VitalsSection seriesByLoinc={vitals?.seriesByLoinc ?? new Map()} />
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Conditions</h2>
        {loadingConditions ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ConditionsTable conditions={conditions} />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Medications</h2>
        {loadingMedications ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <MedicationsTable medications={medications} />
        )}
      </section>

      {(sourceId === "epic" || sourceId === "cerner") && patient ? (
        <MedicationOrderDraft patientId={id} />
      ) : null}
    </div>
  );
}
