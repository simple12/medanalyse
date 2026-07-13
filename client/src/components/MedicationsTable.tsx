import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMedicationName, formatMedicationStatus, formatMedicationAuthoredOn, medicationListHasDuplicateNames } from "@/lib/fhir-clinical";
import type { FhirMedicationRequest } from "@/types/fhir";

type MedicationsTableProps = {
  medications: FhirMedicationRequest[];
};

export function MedicationsTable({ medications }: MedicationsTableProps) {
  const showDuplicateNote = medicationListHasDuplicateNames(medications);
  const showRequestedDate = medications.some(
    (med) => typeof med.authoredOn === "string" && med.authoredOn.trim(),
  );

  if (medications.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No medications recorded.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medication</TableHead>
              {showRequestedDate ? <TableHead>Requested</TableHead> : null}
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {medications.map((m) => (
              <TableRow key={m.id ?? `${formatMedicationName(m)}-${formatMedicationAuthoredOn(m)}`}>
                <TableCell>{formatMedicationName(m)}</TableCell>
                {showRequestedDate ? (
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatMedicationAuthoredOn(m)}
                  </TableCell>
                ) : null}
                <TableCell>{formatMedicationStatus(m)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {showDuplicateNote ? (
        <p className="text-xs text-muted-foreground">
          Cerner sandbox often includes multiple active orders for the same medication. Each row is a
          separate MedicationRequest resource (not an app bug).
        </p>
      ) : null}
    </div>
  );
}
