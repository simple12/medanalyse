import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PatientForm } from "@/components/PatientForm";
import { PatientList } from "@/components/PatientList";
import { SearchBar } from "@/components/SearchBar";
import { FhirApiError, getPatient, listPatients, searchResources } from "@/lib/fhir-client";
import { fetchSmartStatus } from "@/lib/fhir-source-api";
import { useFhirSource } from "@/lib/fhir-source-context";
import { formatPatientName } from "@/lib/fhir-patient";
import {
  copyPatientBundleToClipboard,
  deletePatientAndDependents,
} from "@/lib/fhir-patient-bundle";
import type { FhirPatient } from "@/types/fhir";

export function PatientListPage() {
  const navigate = useNavigate();
  const { sourceVersion, sourceId } = useFhirSource();
  const [patients, setPatients] = useState<FhirPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState<string | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) ?? null;

  const isSmartPatientPortal = sourceId === "cerner" || sourceId === "epic";

  const loadPatients = useCallback(async (name?: string) => {
    setLoading(true);
    setError(null);
    try {
      if (isSmartPatientPortal && sourceId) {
        const status = await fetchSmartStatus(sourceId);
        if (!status.connected) {
          setPatients([]);
          return;
        }

        const patientId = status.patient?.trim();

        if (patientId) {
          try {
            const patient = await getPatient(patientId);
            setPatients([patient]);
            setSelectedPatientId(patient.id ?? patientId);
            return;
          } catch (err) {
            if (err instanceof FhirApiError && err.status === 404) {
              const matches = await searchResources<FhirPatient>("Patient", {
                _id: patientId,
              });
              if (matches.length > 0) {
                setPatients(matches);
                setSelectedPatientId(matches[0].id ?? patientId);
                return;
              }
            }
            throw err;
          }
        }

        const label = sourceId === "cerner" ? "Cerner" : "Epic";
        throw new Error(
          `${label} sign-in did not return a patient context. Launch the app from the ${label} sandbox so the selected patient is passed through, or sign out and sign in again.`,
        );
      }

      const data = await listPatients(name);
      setPatients(data);
    } catch (err) {
      const message =
        err instanceof FhirApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load patients";
      setError(message);
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [isSmartPatientPortal, sourceId]);

  useEffect(() => {
    loadPatients(activeSearch);
  }, [loadPatients, activeSearch, sourceVersion]);

  const handleSearch = () => {
    const trimmed = searchQuery.trim();
    setActiveSearch(trimmed || undefined);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveSearch(undefined);
  };

  const handleSelect = (patient: FhirPatient) => {
    setSelectedPatientId(patient.id ?? null);
  };

  const handleEditSelected = () => {
    if (!selectedPatientId) {
      setError("Select a patient to edit");
      return;
    }
    setEditingPatientId(selectedPatientId);
    setFormOpen(true);
  };

  const handleDetailsSelected = () => {
    if (!selectedPatientId) {
      setError("Select a patient to view details");
      return;
    }
    navigate(`/patient/${selectedPatientId}`);
  };

  const handleNewPatient = () => {
    setEditingPatientId(null);
    setFormOpen(true);
  };

  const handleCopySelected = async () => {
    if (!selectedPatientId || !selectedPatient) {
      setError("Select a patient to copy");
      return;
    }

    setCopying(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const count = await copyPatientBundleToClipboard(selectedPatientId);
      setSuccessMessage(
        `Copied ${count} resources for ${formatPatientName(selectedPatient)} to clipboard (FHIR Bundle JSON).`
      );
    } catch (err) {
      const message =
        err instanceof FhirApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to copy patient bundle";
      setError(message);
    } finally {
      setCopying(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedPatientId || !selectedPatient) {
      setError("Select a patient to delete");
      return;
    }

    const name = formatPatientName(selectedPatient);
    const confirmed = window.confirm(
      `Delete patient "${name}" and all associated resources?\n\nThis removes the Patient plus linked Observations, Conditions, and MedicationRequests from the FHIR server. The general practitioner is not deleted.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const counts = await deletePatientAndDependents(selectedPatientId);
      setSelectedPatientId(null);
      await loadPatients(activeSearch);
      setSuccessMessage(
        `Deleted ${name} and ${counts.observations} observation(s), ${counts.conditions} condition(s), ${counts.medicationRequests} medication request(s).`
      );
    } catch (err) {
      const message =
        err instanceof FhirApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to delete patient";
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!isSmartPatientPortal ? (
          <Button onClick={handleNewPatient}>
            <Plus className="h-4 w-4" />
            New Patient
          </Button>
        ) : null}
        <Button variant="outline" disabled={!selectedPatientId || isSmartPatientPortal} onClick={handleEditSelected}>
          <Pencil className="h-4 w-4" />
          Edit Patient
        </Button>
        <Button variant="outline" disabled={!selectedPatientId} onClick={handleDetailsSelected}>
          <FileText className="h-4 w-4" />
          Patient Details
        </Button>
        <Button
          variant="outline"
          disabled={!selectedPatientId || copying}
          onClick={handleCopySelected}
        >
          <Copy className="h-4 w-4" />
          Copy Patient
        </Button>
        <Button
          variant="destructive"
          disabled={!selectedPatientId || deleting || isSmartPatientPortal}
          onClick={handleDeleteSelected}
        >
          <Trash2 className="h-4 w-4" />
          Delete Patient
        </Button>
      </div>

      {successMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900">
          {successMessage}
        </div>
      )}

      {isSmartPatientPortal ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
          {sourceId === "cerner" ? "Cerner" : "Epic"} patient portal: showing the patient record
          authorized during SMART sign-in (not a full patient search).
        </div>
      ) : null}

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {!isSmartPatientPortal ? (
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onSearch={handleSearch}
          onClear={handleClearSearch}
        />
      ) : null}

      <PatientList
        patients={patients}
        loading={loading}
        selectedPatientId={selectedPatientId}
        onSelect={handleSelect}
      />

      <PatientForm
        open={formOpen}
        patientId={editingPatientId}
        onOpenChange={setFormOpen}
        onSuccess={() => loadPatients(activeSearch)}
        onError={setError}
      />
    </>
  );
}
