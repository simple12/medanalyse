/**
 * Maps a condition to the lab/vital markers that indicate whether it is under
 * control, with MVP target thresholds. Thresholds are intentionally simple and
 * documented; a later phase can source them from clinical guidelines (see
 * AGENT_SPEC.md section 8). Coverage is deliberately small for the MVP.
 */

export type BetterDirection = "down" | "up";

export interface MarkerDefinition {
  /** LOINC codes that carry this marker's value (top-level or component). */
  loinc: string[];
  label: string;
  unit: string;
  /** Latest value must be <= max (when set) and >= min (when set) to be in target. */
  target: { max?: number; min?: number };
  /** Which direction of change counts as improvement. */
  betterDirection: BetterDirection;
}

export interface ConditionMarkerProfile {
  key: string;
  display: string;
  /** Keywords matched (case-insensitive substring) against the condition name. */
  keywords: string[];
  markers: MarkerDefinition[];
}

export function describeTarget(marker: MarkerDefinition): string {
  const { max, min } = marker.target;
  if (max !== undefined && min !== undefined) {
    return `${min}-${max} ${marker.unit}`.trim();
  }
  if (max !== undefined) return `< ${max} ${marker.unit}`.trim();
  if (min !== undefined) return `> ${min} ${marker.unit}`.trim();
  return "no defined target";
}

/**
 * MVP registry. Thresholds reflect commonly cited general targets and are not a
 * substitute for guideline-specific, patient-specific goals.
 */
export const CONDITION_MARKER_PROFILES: ConditionMarkerProfile[] = [
  {
    key: "hypertension",
    display: "Hypertension",
    keywords: ["hypertension", "high blood pressure", "elevated blood pressure"],
    markers: [
      {
        loinc: ["8480-6"],
        label: "Systolic BP",
        unit: "mmHg",
        target: { max: 140 },
        betterDirection: "down",
      },
      {
        loinc: ["8462-4"],
        label: "Diastolic BP",
        unit: "mmHg",
        target: { max: 90 },
        betterDirection: "down",
      },
    ],
  },
  {
    key: "type-2-diabetes",
    display: "Type 2 diabetes mellitus",
    keywords: ["diabetes", "diabetic", "dm2", "t2dm"],
    markers: [
      {
        loinc: ["4548-4", "4549-2", "17856-6"],
        label: "HbA1c",
        unit: "%",
        target: { max: 7 },
        betterDirection: "down",
      },
    ],
  },
  {
    key: "hyperlipidemia",
    display: "Hyperlipidemia",
    keywords: ["hyperlipidemia", "hypercholesterolemia", "dyslipidemia", "high cholesterol"],
    markers: [
      {
        loinc: ["13457-7", "18262-6", "22748-8"],
        label: "LDL cholesterol",
        unit: "mg/dL",
        target: { max: 100 },
        betterDirection: "down",
      },
    ],
  },
];

export function matchConditionProfile(
  conditionName: string,
): ConditionMarkerProfile | undefined {
  const name = conditionName.toLowerCase();
  return CONDITION_MARKER_PROFILES.find((profile) =>
    profile.keywords.some((keyword) => name.includes(keyword)),
  );
}
