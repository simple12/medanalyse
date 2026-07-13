import { describe, expect, it } from "vitest";
import {
  buildEpicAuthorizeScopes,
  normalizeEpicScopes,
} from "../../../shared/fhir-sources.js";

const DEFAULT_SCOPES =
  "openid fhirUser launch/patient patient/Patient.read patient/Observation.read patient/Condition.read patient/MedicationRequest.read offline_access";

describe("normalizeEpicScopes", () => {
  it("normalizes .rs to .read and drops write scopes", () => {
    const scopes = normalizeEpicScopes(
      "openid launch/patient patient/Patient.rs patient/Observation.Read patient/*.write profile",
    );
    expect(scopes.split(" ")).toContain("patient/Patient.read");
    expect(scopes.split(" ")).toContain("patient/Observation.read");
    expect(scopes.split(" ")).not.toContain("patient/*.write");
    expect(scopes.split(" ")).not.toContain("profile");
  });
});

describe("buildEpicAuthorizeScopes", () => {
  it("uses launch scope for EHR launch requests", () => {
    const scopes = buildEpicAuthorizeScopes(DEFAULT_SCOPES, "abc123");
    expect(scopes.split(" ")).toContain("launch");
    expect(scopes.split(" ")).not.toContain("launch/patient");
  });

  it("uses launch/patient for standalone Epic sign-in", () => {
    const scopes = buildEpicAuthorizeScopes(DEFAULT_SCOPES);
    expect(scopes.split(" ")).toContain("launch/patient");
    expect(scopes.split(" ")).not.toContain("launch");
  });
});
