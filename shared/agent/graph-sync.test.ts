import { describe, expect, it } from "vitest";
import { planPatientGraph, isSyncStale } from "./graph-sync.js";
import type { FhirCondition, FhirMedicationRequest, FhirObservation } from "./fhir.js";

function condition(name: string, id = "c1"): FhirCondition {
  return {
    resourceType: "Condition",
    id,
    code: { text: name },
    clinicalStatus: { coding: [{ code: "active" }] },
  };
}

function med(name: string, id = "m1"): FhirMedicationRequest {
  return {
    resourceType: "MedicationRequest",
    id,
    status: "completed",
    medicationCodeableConcept: { text: name },
  };
}

function obs(loinc: string, id = "o1"): FhirObservation {
  return {
    resourceType: "Observation",
    id,
    code: { coding: [{ system: "http://loinc.org", code: loinc }] },
    valueQuantity: { value: 120, unit: "mmHg" },
  };
}

describe("planPatientGraph", () => {
  it("builds patient, condition, medication nodes and edges", () => {
    const planned = planPatientGraph({
      sourceId: "epic",
      patientId: "p1",
      conditions: [condition("Essential hypertension")],
      medications: [med("aspirin")],
      observations: [obs("8480-6")],
      assessments: [],
    });

    expect(planned.nodes.some((n) => n.resourceType === "Patient")).toBe(true);
    expect(planned.nodes.some((n) => n.resourceType === "Condition")).toBe(true);
    expect(planned.nodes.some((n) => n.resourceType === "MedicationRequest")).toBe(
      true,
    );
    expect(planned.edges.some((e) => e.relType === "HAS_CONDITION")).toBe(true);
    expect(planned.edges.some((e) => e.relType === "PRESCRIBED")).toBe(true);
    expect(planned.edges.some((e) => e.relType === "MONITORED_BY")).toBe(true);
    expect(planned.chunks.length).toBeGreaterThan(0);
  });
});

describe("isSyncStale", () => {
  it("treats missing sync as stale", () => {
    expect(isSyncStale(undefined)).toBe(true);
  });

  it("uses the stale window", () => {
    const now = Date.UTC(2026, 6, 14, 12, 0, 0);
    expect(isSyncStale(new Date(now - 10 * 60 * 1000), now)).toBe(false);
    expect(isSyncStale(new Date(now - 70 * 60 * 1000), now)).toBe(true);
  });
});
