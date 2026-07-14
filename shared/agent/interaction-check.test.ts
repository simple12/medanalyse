import { describe, expect, it } from "vitest";
import {
  allergyWarningsForProposed,
  buildInteractionCheckResult,
} from "./interaction-check.js";
import type { FhirAllergyIntolerance, FhirMedicationRequest } from "./fhir.js";

function med(
  id: string,
  display: string,
  opts?: { rxnorm?: string; status?: string },
): FhirMedicationRequest {
  return {
    resourceType: "MedicationRequest",
    id,
    status: opts?.status ?? "completed",
    medicationCodeableConcept: {
      text: display,
      coding: opts?.rxnorm
        ? [
            {
              system: "http://www.nlm.nih.gov/research/umls/rxnorm",
              code: opts.rxnorm,
              display,
            },
          ]
        : undefined,
    },
  };
}

describe("buildInteractionCheckResult", () => {
  it("flags aspirin + warfarin as a major interaction", () => {
    const result = buildInteractionCheckResult({
      patientId: "p1",
      sourceId: "epic",
      proposed: { rxnormCode: "11289", display: "warfarin" },
      medications: [med("m1", "aspirin 325 MG tablet", { rxnorm: "1191" })],
      allergies: [],
      allergiesUnavailable: false,
      generatedAt: "2026-07-14T00:00:00.000Z",
    });

    expect(result.knownInteractionCount).toBe(1);
    expect(result.findings[0]?.severity).toBe("major");
    expect(result.card.indicator).toBe("critical");
    expect(result.card.recommendations[0]?.type).toBe("interaction-alert");
    expect(result.submitEnabled).toBe(false);
    expect(result.noKnownInteractionMessage).toBeUndefined();
  });

  it("uses no-known wording when the subset has no pair", () => {
    const result = buildInteractionCheckResult({
      patientId: "p1",
      sourceId: "epic",
      proposed: { rxnormCode: "6809", display: "metformin" },
      medications: [med("m1", "lisinopril", { rxnorm: "29046" })],
      allergies: [],
      allergiesUnavailable: false,
    });

    expect(result.knownInteractionCount).toBe(0);
    expect(result.noKnownInteractionMessage).toMatch(/No known interaction/);
    expect(result.noKnownInteractionMessage).toMatch(/does not mean/);
    expect(result.card.indicator).toBe("info");
  });

  it("notes when proposed drug is outside the subset", () => {
    const result = buildInteractionCheckResult({
      patientId: "p1",
      sourceId: "epic",
      proposed: { display: "obscure-drug-xyz" },
      medications: [med("m1", "aspirin", { rxnorm: "1191" })],
      allergies: [],
      allergiesUnavailable: true,
    });

    expect(result.knownInteractionCount).toBe(0);
    expect(result.allergiesUnavailable).toBe(true);
    expect(result.noKnownInteractionMessage).toMatch(/not mapped/);
    expect(result.card.detail).toMatch(/AllergyIntolerance could not be read/);
  });
});

describe("allergyWarningsForProposed", () => {
  it("matches allergy labels to proposed display", () => {
    const allergies: FhirAllergyIntolerance[] = [
      {
        resourceType: "AllergyIntolerance",
        code: { text: "Aspirin" },
      },
    ];
    expect(allergyWarningsForProposed("aspirin 325 MG", allergies)).toEqual([
      "Aspirin",
    ]);
  });
});
