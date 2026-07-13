import { describe, expect, it } from "vitest";
import { buildCernerAuthorizeScopes } from "../../../shared/fhir-sources.js";

const DEFAULT_SCOPES =
  "openid fhirUser launch/patient profile patient/Patient.rs patient/Observation.rs";

describe("buildCernerAuthorizeScopes", () => {
  it("uses launch scope for EHR launch requests", () => {
    const scopes = buildCernerAuthorizeScopes(DEFAULT_SCOPES, "abc123");
    expect(scopes.split(" ")).toContain("launch");
    expect(scopes.split(" ")).not.toContain("launch/patient");
  });

  it("uses launch/patient for standalone Cerner sign-in", () => {
    const scopes = buildCernerAuthorizeScopes(DEFAULT_SCOPES);
    expect(scopes.split(" ")).toContain("launch/patient");
    expect(scopes.split(" ")).not.toContain("launch");
  });
});
