import { describe, expect, it } from "vitest";
import { buildContextChunks, retrieveRelevantChunks } from "./context.js";
import type { FhirCondition, FhirMedicationRequest, FhirObservation } from "./fhir.js";

describe("context retrieval", () => {
  const conditions: FhirCondition[] = [
    {
      resourceType: "Condition",
      id: "c1",
      code: { text: "Hypertension" },
    },
  ];
  const medications: FhirMedicationRequest[] = [
    {
      resourceType: "MedicationRequest",
      id: "m1",
      status: "active",
      medicationCodeableConcept: { text: "lisinopril 10 MG" },
    },
  ];
  const observations: FhirObservation[] = [
    {
      resourceType: "Observation",
      id: "o1",
      code: { coding: [{ system: "http://loinc.org", code: "8480-6", display: "Systolic BP" }] },
      effectiveDateTime: "2024-01-10",
      valueQuantity: { value: 150, unit: "mmHg" },
    },
  ];

  it("builds citation-bearing chunks from FHIR resources", () => {
    const chunks = buildContextChunks({
      conditions,
      medications,
      observations,
      assessments: [],
    });
    expect(chunks.some((c) => c.resourceType === "Condition")).toBe(true);
    expect(chunks.some((c) => c.text.toLowerCase().includes("lisinopril"))).toBe(true);
    expect(chunks.some((c) => c.text.includes("150"))).toBe(true);
  });

  it("ranks blood-pressure question against systolic observation", () => {
    const chunks = buildContextChunks({
      conditions,
      medications,
      observations,
      assessments: [],
    });
    const { citations } = retrieveRelevantChunks(
      "Has blood pressure improved on lisinopril?",
      chunks,
      3,
    );
    expect(citations.length).toBeGreaterThan(0);
    expect(
      citations.some(
        (c) =>
          c.excerpt.toLowerCase().includes("systolic") ||
          c.excerpt.toLowerCase().includes("lisinopril") ||
          c.excerpt.toLowerCase().includes("hypertension"),
      ),
    ).toBe(true);
  });

  it("returns medication chunks for medication questions", () => {
    const chunks = buildContextChunks({
      conditions,
      medications,
      observations,
      assessments: [],
    });
    const { citations } = retrieveRelevantChunks(
      "what medications is this patient on",
      chunks,
      5,
    );
    expect(citations.length).toBeGreaterThan(0);
    expect(citations.every((c) => c.resourceType === "MedicationRequest")).toBe(true);
    expect(citations[0].excerpt.toLowerCase()).toContain("lisinopril");
  });
});
