import { describe, expect, it } from "vitest";
import {
  findInteractionsForProposed,
  lookupInteraction,
  resolveDrugIdentity,
} from "./index.js";

describe("DDInter lookup", () => {
  it("resolves drugs by RxNorm and display alias", () => {
    expect(resolveDrugIdentity({ rxnormCode: "1191" })?.display).toBe("aspirin");
    expect(resolveDrugIdentity({ display: "Aspirin 325 MG tablet" })?.rxnorm).toBe(
      "1191",
    );
    expect(resolveDrugIdentity({ display: "Coumadin" })?.rxnorm).toBe("11289");
  });

  it("finds a known aspirin + warfarin interaction", () => {
    const hit = lookupInteraction("1191", "11289");
    expect(hit?.severity).toBe("major");
    expect(hit?.mechanism).toMatch(/bleeding/i);
  });

  it("returns ordered hits for a proposed drug against current meds", () => {
    const proposed = resolveDrugIdentity({ rxnormCode: "5640" });
    expect(proposed).toBeTruthy();
    const hits = findInteractionsForProposed(proposed!, [
      { rxnorm: "1191", display: "aspirin" },
      { display: "metformin" },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.current.rxnorm).toBe("1191");
    expect(hits[0]?.severity).toBe("moderate");
  });

  it("returns no hits for combinations outside the subset", () => {
    const proposed = resolveDrugIdentity({ rxnormCode: "6809" });
    const hits = findInteractionsForProposed(proposed!, [
      { rxnorm: "29046", display: "lisinopril" },
    ]);
    expect(hits).toHaveLength(0);
  });
});
