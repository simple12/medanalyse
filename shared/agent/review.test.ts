import { describe, expect, it } from "vitest";
import { buildAgentCard } from "./review.js";
import type { ConditionAssessment } from "./types.js";

function assessment(
  conditionName: string,
  status: ConditionAssessment["status"],
): ConditionAssessment {
  return {
    conditionName,
    status,
    markers: [],
    medications: [],
    rationale: `${conditionName} is ${status}`,
  };
}

describe("buildAgentCard", () => {
  it("flags warning and a recommendation when a condition is worsening", () => {
    const card = buildAgentCard([
      assessment("Hypertension", "worsening"),
      assessment("Diabetes", "controlled"),
    ]);
    expect(card.indicator).toBe("warning");
    expect(card.recommendations).toHaveLength(1);
    expect(card.recommendations[0].evidence.length).toBeGreaterThan(0);
    expect(card.summary).toContain("1 of 2");
  });

  it("is info with no recommendations when everything is controlled", () => {
    const card = buildAgentCard([assessment("Hypertension", "controlled")]);
    expect(card.indicator).toBe("info");
    expect(card.recommendations).toHaveLength(0);
    expect(card.summary).toBe("All monitored conditions appear controlled");
  });

  it("reports when no monitorable conditions exist", () => {
    const card = buildAgentCard([assessment("Allergic rhinitis", "unmonitored")]);
    expect(card.indicator).toBe("info");
    expect(card.summary).toBe("No monitorable conditions found for this patient");
  });

  it("every recommendation carries at least one citation", () => {
    const card = buildAgentCard([assessment("Hypertension", "worsening")]);
    for (const rec of card.recommendations) {
      expect(rec.evidence.length).toBeGreaterThan(0);
    }
  });
});
