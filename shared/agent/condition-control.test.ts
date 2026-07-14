import { describe, expect, it } from "vitest";
import { assessConditionControl } from "./condition-control.js";
import type {
  FhirCondition,
  FhirMedicationRequest,
  FhirObservation,
} from "./fhir.js";

function condition(display: string, opts?: { id?: string; status?: string }): FhirCondition {
  return {
    resourceType: "Condition",
    id: opts?.id,
    code: { coding: [{ system: "http://snomed.info/sct", display }] },
    clinicalStatus: opts?.status
      ? { coding: [{ code: opts.status }] }
      : undefined,
  };
}

function simpleObs(loinc: string, value: number, date: string, unit: string): FhirObservation {
  return {
    resourceType: "Observation",
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code: loinc }] },
    effectiveDateTime: date,
    valueQuantity: { value, unit },
  };
}

function bpPanel(
  systolic: number,
  diastolic: number,
  date: string,
): FhirObservation {
  return {
    resourceType: "Observation",
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code: "85354-9" }] },
    effectiveDateTime: date,
    component: [
      {
        code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] },
        valueQuantity: { value: systolic, unit: "mmHg" },
      },
      {
        code: { coding: [{ system: "http://loinc.org", code: "8462-4" }] },
        valueQuantity: { value: diastolic, unit: "mmHg" },
      },
    ],
  };
}

describe("assessConditionControl - hypertension", () => {
  it("marks controlled when latest BP is within target", () => {
    const [assessment] = assessConditionControl(
      [condition("Essential hypertension")],
      [bpPanel(150, 95, "2025-01-01"), bpPanel(132, 82, "2025-06-01")],
      [],
    );
    expect(assessment.status).toBe("controlled");
    expect(assessment.markers).toHaveLength(2);
  });

  it("marks worsening when out of target and trending up", () => {
    const [assessment] = assessConditionControl(
      [condition("Hypertension")],
      [bpPanel(148, 92, "2025-01-01"), bpPanel(158, 96, "2025-06-01")],
      [],
    );
    expect(assessment.status).toBe("worsening");
  });

  it("marks improving when out of target but trending down", () => {
    const [assessment] = assessConditionControl(
      [condition("Hypertension")],
      [bpPanel(170, 100, "2025-01-01"), bpPanel(150, 92, "2025-06-01")],
      [],
    );
    expect(assessment.status).toBe("improving");
  });

  it("overall status is worsening if any single marker worsens", () => {
    // Diastolic controlled, systolic worsening -> overall worsening.
    const [assessment] = assessConditionControl(
      [condition("Hypertension")],
      [bpPanel(145, 80, "2025-01-01"), bpPanel(160, 78, "2025-06-01")],
      [],
    );
    expect(assessment.status).toBe("worsening");
  });
});

describe("assessConditionControl - diabetes", () => {
  it("insufficient-data when a single out-of-target reading exists", () => {
    const [assessment] = assessConditionControl(
      [condition("Type 2 diabetes mellitus")],
      [simpleObs("4548-4", 8.1, "2025-06-01", "%")],
      [],
    );
    expect(assessment.status).toBe("insufficient-data");
    expect(assessment.markers[0].withinTarget).toBe(false);
  });

  it("controlled when HbA1c is at or below target", () => {
    const [assessment] = assessConditionControl(
      [condition("Diabetic - poorly controlled")],
      [simpleObs("4548-4", 6.5, "2025-06-01", "%")],
      [],
    );
    expect(assessment.status).toBe("controlled");
  });
});

describe("assessConditionControl - edge cases", () => {
  it("unmonitored when the condition has no marker readings", () => {
    const [assessment] = assessConditionControl(
      [condition("Hypertension")],
      [simpleObs("4548-4", 6.0, "2025-06-01", "%")], // unrelated marker
      [],
    );
    expect(assessment.status).toBe("unmonitored");
    expect(assessment.markers).toHaveLength(0);
  });

  it("still returns an unmonitored assessment for conditions not in the registry", () => {
    const results = assessConditionControl(
      [condition("Seasonal allergic rhinitis")],
      [],
      [],
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("unmonitored");
  });

  it("excludes resolved conditions", () => {
    const results = assessConditionControl(
      [condition("Hypertension", { status: "resolved" })],
      [bpPanel(180, 110, "2025-06-01")],
      [],
    );
    expect(results).toHaveLength(0);
  });

  it("links medications via reasonReference", () => {
    const med: FhirMedicationRequest = {
      resourceType: "MedicationRequest",
      status: "active",
      medicationCodeableConcept: { text: "Lisinopril 10mg" },
      reasonReference: [{ reference: "Condition/htn-1" }],
    };
    const [assessment] = assessConditionControl(
      [condition("Hypertension", { id: "htn-1" })],
      [bpPanel(150, 95, "2025-06-01")],
      [med],
    );
    expect(assessment.medications).toContain("Lisinopril 10mg");
  });
});
