import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatActive,
  formatAddressCity,
  formatGender,
  formatMaritalStatus,
  formatPatientName,
  formatPhone,
} from "@/lib/fhir-patient";
import type { FhirPatient } from "@/types/fhir";
import { cn } from "@/lib/utils";

interface PatientListProps {
  patients: FhirPatient[];
  loading: boolean;
  selectedPatientId: string | null;
  onSelect: (patient: FhirPatient) => void;
}

export function PatientList({
  patients,
  loading,
  selectedPatientId,
  onSelect,
}: PatientListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        No patients found. Create a new patient or adjust your search.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Gender</TableHead>
            <TableHead>Date of Birth</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Marital Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {patients.map((patient) => {
            const isSelected = patient.id === selectedPatientId;
            return (
              <TableRow
                key={patient.id ?? formatPatientName(patient)}
                className={cn("cursor-pointer", isSelected && "bg-muted")}
                onClick={() => onSelect(patient)}
              >
                <TableCell className="font-medium">
                  {patient.id ? (
                    <Link
                      to={`/patient/${patient.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {formatPatientName(patient)}
                    </Link>
                  ) : (
                    formatPatientName(patient)
                  )}
                </TableCell>
                <TableCell>{formatActive(patient.active)}</TableCell>
                <TableCell>{formatGender(patient.gender)}</TableCell>
                <TableCell>{patient.birthDate ?? "—"}</TableCell>
                <TableCell>{formatPhone(patient)}</TableCell>
                <TableCell>{formatAddressCity(patient)}</TableCell>
                <TableCell>{formatMaritalStatus(patient)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
