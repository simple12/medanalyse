import { describe, expect, it } from "vitest";
import type { FhirObservation } from "@/types/fhir";
import {
  formatMedicationName,
  getVitalSeriesList,
  parseObservations,
} from "@/lib/fhir-clinical";

function observation(
  code: FhirObservation["code"],
  value: number,
  unit = "unit",
): FhirObservation {
  return {
    resourceType: "Observation",
    status: "final",
    code,
    effectiveDateTime: "2025-01-15T10:00:00.000Z",
    valueQuantity: { value, unit },
  };
}

describe("parseObservations display labels", () => {
  it("uses LOINC coding display when present", () => {
    const observations = [
      observation(
        {
          coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }],
        },
        72,
        "/min",
      ),
    ];

    const { seriesByLoinc } = parseObservations(observations);
    const series = getVitalSeriesList(seriesByLoinc);

    expect(series).toHaveLength(1);
    expect(series[0]?.label).toBe("Heart rate");
    expect(series[0]?.loinc).toBe("8867-4");
  });

  it("uses full LOINC display for lab codes not in the static map", () => {
    const ldlDisplay = "Cholesterol in LDL [Mass/volume] in Serum or Plasma";
    const observations = [
      observation(
        {
          coding: [{ system: "http://loinc.org", code: "18262-6", display: ldlDisplay }],
        },
        120,
        "mg/dL",
      ),
    ];

    const { seriesByLoinc } = parseObservations(observations);
    const series = getVitalSeriesList(seriesByLoinc);

    expect(series[0]?.label).toBe(ldlDisplay);
  });

  it("falls back to raw LOINC code when display is missing and code is not in the map", () => {
    const observations = [
      observation(
        {
          coding: [{ system: "http://loinc.org", code: "18262-6" }],
        },
        120,
        "mg/dL",
      ),
    ];

    const { seriesByLoinc } = parseObservations(observations);
    const series = getVitalSeriesList(seriesByLoinc);

    expect(series[0]?.label).toBe("18262-6");
  });

  it("uses code.text when there is no LOINC code", () => {
    const observations = [
      observation({ text: "Custom vital" }, 42, "units"),
    ];

    const { seriesByLoinc } = parseObservations(observations);
    const series = getVitalSeriesList(seriesByLoinc);

    expect(series[0]?.label).toBe("Custom vital");
    expect(series[0]?.loinc).toBe("display:Custom vital");
  });
});

describe("formatMedicationName", () => {
  it("uses medicationCodeableConcept display when present", () => {
    const name = formatMedicationName({
      resourceType: "MedicationRequest",
      medicationCodeableConcept: {
        coding: [{ display: "Ibuprofen 200 MG Oral Tablet" }],
      },
    });
    expect(name).toBe("Ibuprofen 200 MG Oral Tablet");
  });

  it("uses medicationReference display instead of raw reference id", () => {
    const name = formatMedicationName({
      resourceType: "MedicationRequest",
      medicationReference: {
        reference: "Medication/e.Y79OPS9YTaZQWUR",
        display: "Simvastatin 10 MG Oral Tablet",
      },
    });
    expect(name).toBe("Simvastatin 10 MG Oral Tablet");
  });

  it("does not show raw Medication reference ids", () => {
    const name = formatMedicationName({
      resourceType: "MedicationRequest",
      medicationReference: {
        reference: "Medication/e.Y79OPS9YTaZQWUR-O58gvsRhtkshFVW4BzxPQ526s",
      },
    });
    expect(name).toBe("Unknown medication");
    expect(name).not.toContain("Medication/");
  });
});
