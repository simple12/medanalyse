import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VitalChart } from "@/components/VitalChart";
import {
  buildVitalsCrossTab,
  getBloodPressureSeries,
  getVitalSeriesList,
  type VitalDataPoint,
} from "@/lib/fhir-clinical";

type VitalsSectionProps = {
  seriesByLoinc: Map<string, VitalDataPoint[]>;
};

export function VitalsSection({ seriesByLoinc }: VitalsSectionProps) {
  const [view, setView] = useState<"chart" | "table">("chart");

  const vitalSeries = getVitalSeriesList(seriesByLoinc);
  const bp = getBloodPressureSeries(seriesByLoinc);
  const crossTab = useMemo(() => buildVitalsCrossTab(seriesByLoinc), [seriesByLoinc]);
  const hasBp = bp.systolic.length > 0 || bp.diastolic.length > 0;
  const hasData = vitalSeries.length > 0 || hasBp;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Vitals</h2>
        <div className="flex gap-2">
          <Button
            variant={view === "chart" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("chart")}
          >
            Chart view
          </Button>
          <Button
            variant={view === "table" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("table")}
          >
            Table view
          </Button>
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No vitals recorded.
        </div>
      ) : view === "chart" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {vitalSeries.map((s) => (
            <VitalChart
              key={s.loinc}
              title={s.label}
              series={[{ name: s.label, points: s.points, color: "#2563eb" }]}
            />
          ))}
          {hasBp && (
            <VitalChart
              title="Blood pressure"
              series={[
                { name: "Systolic", points: bp.systolic, color: "#dc2626" },
                { name: "Diastolic", points: bp.diastolic, color: "#2563eb" },
              ]}
            />
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background">Date</TableHead>
                {crossTab.columns.map((col) => (
                  <TableHead key={col.loinc} className="whitespace-nowrap">
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {crossTab.rows.map((row) => (
                <TableRow key={row.date}>
                  <TableCell className="sticky left-0 bg-background font-medium whitespace-nowrap">
                    {row.date}
                  </TableCell>
                  {crossTab.columns.map((col) => (
                    <TableCell key={col.loinc} className="whitespace-nowrap">
                      {row.values[col.loinc]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
