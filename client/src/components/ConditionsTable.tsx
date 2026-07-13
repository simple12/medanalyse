import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatConditionName, formatConditionOnset } from "@/lib/fhir-clinical";
import type { FhirCondition } from "@/types/fhir";

type ConditionsTableProps = {
  conditions: FhirCondition[];
};

export function ConditionsTable({ conditions }: ConditionsTableProps) {
  if (conditions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No conditions recorded.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Condition</TableHead>
            <TableHead>Onset date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {conditions.map((c) => (
            <TableRow key={c.id ?? formatConditionName(c)}>
              <TableCell>{formatConditionName(c)}</TableCell>
              <TableCell>{formatConditionOnset(c)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
