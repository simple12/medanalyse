import type {
  CodeableConcept,
  FhirCondition,
  FhirMedicationRequest,
  FhirObservation,
} from "@/types/fhir";

export const VITAL_LOINC_CODES = [
  "8867-4",
  "8310-5",
  "9279-1",
  "59408-5",
  "8302-2",
  "29463-7",
  "39156-5",
  "55284-4",
  "8480-6",
  "8462-4",
] as const;

export const LOINC_LABELS: Record<string, string> = {
  "8867-4": "Heart rate",
  "8310-5": "Temperature",
  "9279-1": "Respiratory rate",
  "59408-5": "Oxygen saturation",
  "8302-2": "Height",
  "29463-7": "Weight",
  "39156-5": "BMI",
  "55284-4": "Blood pressure panel",
  "8480-6": "Systolic BP",
  "8462-4": "Diastolic BP",
  "2708-6": "Oxygen saturation (arterial)",
  "3137-7": "Body height",
  "69000-8": "Heart rate",
};

export type VitalDataPoint = {
  date: string;
  value: number;
  unit: string;
  label: string;
};

export type VitalSeries = {
  loinc: string;
  label: string;
  points: VitalDataPoint[];
};

export type VitalTableRow = {
  vital: string;
  date: string;
  value: string;
};

function getLoincCode(concept?: CodeableConcept): string | undefined {
  return concept?.coding?.find((c) => c.system?.includes("loinc"))?.code ?? concept?.coding?.[0]?.code;
}

export function getCodeableConceptLabel(concept?: CodeableConcept): string | undefined {
  const loincCoding = concept?.coding?.find((c) => c.system?.includes("loinc"));
  return (
    loincCoding?.display?.trim() ||
    concept?.text?.trim() ||
    concept?.coding?.[0]?.display?.trim() ||
    undefined
  );
}

function seriesLabel(key: string): string {
  if (key.startsWith("display:")) {
    return key.slice("display:".length);
  }
  return LOINC_LABELS[key] ?? key;
}

function resolveSeriesLabel(key: string, displayLabel?: string): string {
  if (displayLabel) return displayLabel;
  return seriesLabel(key);
}

function observationSeriesKey(obs: FhirObservation): string | undefined {
  const loinc = getLoincCode(obs.code);
  if (loinc) return loinc;
  const display = getCodeableConceptLabel(obs.code);
  return display ? `display:${display}` : undefined;
}

function componentSeriesKey(component: NonNullable<FhirObservation["component"]>[number]): string | undefined {
  const loinc = getLoincCode(component.code);
  if (loinc) return loinc;
  const display = getCodeableConceptLabel(component.code);
  return display ? `display:${display}` : undefined;
}

function getEffectiveDate(obs: FhirObservation): string {
  return obs.effectiveDateTime ?? obs.effectivePeriod?.start ?? "";
}

function formatDisplayValue(value: number, unit: string): string {
  return unit ? `${value} ${unit}` : String(value);
}

function addPoint(
  map: Map<string, VitalDataPoint[]>,
  key: string,
  date: string,
  value: number | undefined,
  unit: string,
  displayLabel?: string
): void {
  if (!date || value === undefined || Number.isNaN(value)) return;
  const points = map.get(key) ?? [];
  points.push({
    date,
    value,
    unit,
    label: resolveSeriesLabel(key, displayLabel),
  });
  map.set(key, points);
}

export function parseObservations(observations: FhirObservation[]): {
  seriesByLoinc: Map<string, VitalDataPoint[]>;
  tableRows: VitalTableRow[];
} {
  const map = new Map<string, VitalDataPoint[]>();

  for (const obs of observations) {
    const date = getEffectiveDate(obs);
    const mainKey = observationSeriesKey(obs);

    if (obs.valueQuantity?.value !== undefined && mainKey) {
      addPoint(
        map,
        mainKey,
        date,
        obs.valueQuantity.value,
        obs.valueQuantity.unit ?? "",
        getCodeableConceptLabel(obs.code)
      );
    }

    for (const component of obs.component ?? []) {
      const key = componentSeriesKey(component);
      if (key && component.valueQuantity?.value !== undefined) {
        addPoint(
          map,
          key,
          date,
          component.valueQuantity.value,
          component.valueQuantity.unit ?? "",
          getCodeableConceptLabel(component.code)
        );
      }
    }
  }

  for (const [loinc, points] of map) {
    points.sort((a, b) => a.date.localeCompare(b.date));
    map.set(loinc, points);
  }

  const tableRows: VitalTableRow[] = [];
  for (const [, points] of map) {
    for (const p of points) {
      tableRows.push({
        vital: p.label,
        date: p.date.slice(0, 10),
        value: formatDisplayValue(p.value, p.unit),
      });
    }
  }
  tableRows.sort((a, b) => a.date.localeCompare(b.date));

  return { seriesByLoinc: map, tableRows };
}

export type VitalCrossTabColumn = {
  loinc: string;
  label: string;
};

export type VitalCrossTabRow = {
  date: string;
  values: Record<string, string>;
};

/** Column order for cross-tab table (vitals as columns, dates as rows). */
const CROSS_TAB_COLUMN_ORDER = [
  "8867-4",
  "8310-5",
  "9279-1",
  "59408-5",
  "8302-2",
  "29463-7",
  "39156-5",
  "8480-6",
  "8462-4",
] as const;

const CROSS_TAB_SKIP = new Set(["55284-4"]);

export function buildVitalsCrossTab(map: Map<string, VitalDataPoint[]>): {
  columns: VitalCrossTabColumn[];
  rows: VitalCrossTabRow[];
} {
  const columns: VitalCrossTabColumn[] = CROSS_TAB_COLUMN_ORDER.filter(
    (loinc) => !CROSS_TAB_SKIP.has(loinc) && (map.get(loinc)?.length ?? 0) > 0
  ).map((loinc) => ({
    loinc,
    label: map.get(loinc)?.[0]?.label ?? LOINC_LABELS[loinc] ?? loinc,
  }));

  const dateSet = new Set<string>();
  for (const col of columns) {
    for (const p of map.get(col.loinc) ?? []) {
      dateSet.add(p.date.slice(0, 10));
    }
  }

  const rows: VitalCrossTabRow[] = Array.from(dateSet)
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const values: Record<string, string> = {};
      for (const col of columns) {
        const point = (map.get(col.loinc) ?? []).find((p) => p.date.slice(0, 10) === date);
        values[col.loinc] = point ? formatDisplayValue(point.value, point.unit) : "—";
      }
      return { date, values };
    });

  return { columns, rows };
}

export function getVitalSeriesList(map: Map<string, VitalDataPoint[]>): VitalSeries[] {
  const skipBpComponents = new Set(["8480-6", "8462-4", "55284-4"]);
  const result: VitalSeries[] = [];

  for (const [loinc, points] of map) {
    if (skipBpComponents.has(loinc)) continue;
    result.push({
      loinc,
      label: points[0]?.label ?? seriesLabel(loinc),
      points,
    });
  }

  return result.sort((a, b) => a.label.localeCompare(b.label));
}

export function getBloodPressureSeries(map: Map<string, VitalDataPoint[]>): {
  systolic: VitalDataPoint[];
  diastolic: VitalDataPoint[];
} {
  return {
    systolic: map.get("8480-6") ?? [],
    diastolic: map.get("8462-4") ?? [],
  };
}

export function formatConditionName(condition: FhirCondition): string {
  const coding = condition.code?.coding?.[0];
  return coding?.display ?? coding?.code ?? "Unknown condition";
}

export function formatConditionOnset(condition: FhirCondition): string {
  const date = condition.onsetDateTime ?? condition.onsetPeriod?.start;
  return date ? date.slice(0, 10) : "—";
}

export function formatMedicationName(med: FhirMedicationRequest): string {
  const fromConcept = getCodeableConceptLabel(med.medicationCodeableConcept);
  if (fromConcept) return fromConcept;

  const coding = med.medicationCodeableConcept?.coding?.[0];
  if (coding?.code?.trim()) return coding.code.trim();

  const referenceDisplay = med.medicationReference?.display?.trim();
  if (referenceDisplay) return referenceDisplay;

  return "Unknown medication";
}

export function formatMedicationStatus(med: FhirMedicationRequest): string {
  if (!med.status) return "—";
  return med.status.charAt(0).toUpperCase() + med.status.slice(1);
}

export function formatMedicationAuthoredOn(med: FhirMedicationRequest): string {
  const authoredOn = med.authoredOn;
  return typeof authoredOn === "string" && authoredOn.trim() ? authoredOn.slice(0, 10) : "—";
}

export function prepareMedicationRequestsForDisplay(
  medications: FhirMedicationRequest[],
): FhirMedicationRequest[] {
  const seen = new Map<string, FhirMedicationRequest>();
  const withoutId: FhirMedicationRequest[] = [];

  for (const med of medications) {
    if (!med.id) {
      withoutId.push(med);
      continue;
    }
    if (!seen.has(med.id)) {
      seen.set(med.id, med);
    }
  }

  return [...seen.values(), ...withoutId].sort((a, b) => {
    const aDate = typeof a.authoredOn === "string" ? a.authoredOn : "";
    const bDate = typeof b.authoredOn === "string" ? b.authoredOn : "";
    return bDate.localeCompare(aDate);
  });
}

export function medicationListHasDuplicateNames(medications: FhirMedicationRequest[]): boolean {
  const names = medications.map((med) => formatMedicationName(med));
  return new Set(names).size !== names.length;
}

export function formatPractitionerName(practitioner: {
  name?: Array<{ given?: string[]; family?: string; prefix?: string[] }>;
}): string {
  const name = practitioner.name?.[0];
  if (!name) return "—";
  const parts = [...(name.prefix ?? []), ...(name.given ?? []), name.family ?? ""].filter(Boolean);
  return parts.join(" ") || "—";
}
