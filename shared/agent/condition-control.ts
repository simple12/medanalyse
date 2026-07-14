/**
 * Deterministic condition-control engine (AGENT_SPEC.md Journey A).
 *
 * Given a patient's active conditions, quantitative observations, and current
 * medications, decide per condition whether it looks controlled, improving,
 * worsening, or unassessable - using marker trends against MVP target
 * thresholds. This layer uses no LLM and no external services, so its output is
 * reproducible and fully testable; the LLM only adds prose on top later.
 */

import {
  conceptLabel,
  isActiveCondition,
  loincCodes,
  observationDate,
  type FhirCondition,
  type FhirMedicationRequest,
  type FhirObservation,
} from "./fhir.js";
import {
  describeTarget,
  matchConditionProfile,
  type MarkerDefinition,
} from "./condition-markers.js";
import type {
  ConditionAssessment,
  ControlStatus,
  MarkerAssessment,
  MarkerReading,
  TrendDirection,
} from "./types.js";

/** Values within this fraction of each other are treated as flat, not a trend. */
const TREND_EPSILON_FRACTION = 0.02;

function readingsForMarker(
  observations: FhirObservation[],
  marker: MarkerDefinition,
): MarkerReading[] {
  const wanted = new Set(marker.loinc);
  const readings: MarkerReading[] = [];

  for (const obs of observations) {
    const date = observationDate(obs);
    if (!date) continue;

    // Top-level value.
    if (
      obs.valueQuantity?.value !== undefined &&
      loincCodes(obs.code).some((code) => wanted.has(code))
    ) {
      readings.push({
        loinc: marker.loinc[0],
        label: marker.label,
        value: obs.valueQuantity.value,
        unit: obs.valueQuantity.unit ?? marker.unit,
        date: date.slice(0, 10),
      });
    }

    // Component values (e.g. systolic/diastolic inside a BP panel).
    for (const component of obs.component ?? []) {
      if (
        component.valueQuantity?.value !== undefined &&
        loincCodes(component.code).some((code) => wanted.has(code))
      ) {
        readings.push({
          loinc: marker.loinc[0],
          label: marker.label,
          value: component.valueQuantity.value,
          unit: component.valueQuantity.unit ?? marker.unit,
          date: date.slice(0, 10),
        });
      }
    }
  }

  return readings.sort((a, b) => a.date.localeCompare(b.date));
}

function isWithinTarget(value: number, marker: MarkerDefinition): boolean {
  const { max, min } = marker.target;
  if (max !== undefined && value > max) return false;
  if (min !== undefined && value < min) return false;
  return true;
}

function computeTrend(previous: number, latest: number): TrendDirection {
  const epsilon = Math.abs(previous) * TREND_EPSILON_FRACTION;
  if (latest > previous + epsilon) return "up";
  if (latest < previous - epsilon) return "down";
  return "flat";
}

function markerStatus(
  latest: MarkerReading,
  previous: MarkerReading | undefined,
  trend: TrendDirection,
  marker: MarkerDefinition,
): ControlStatus {
  const withinTarget = isWithinTarget(latest.value, marker);
  if (withinTarget) return "controlled";
  if (!previous) return "insufficient-data";

  const movingTowardTarget =
    (marker.betterDirection === "down" && trend === "down") ||
    (marker.betterDirection === "up" && trend === "up");
  return movingTowardTarget ? "improving" : "worsening";
}

function assessMarker(
  observations: FhirObservation[],
  marker: MarkerDefinition,
): MarkerAssessment | null {
  const readings = readingsForMarker(observations, marker);
  if (readings.length === 0) return null;

  const latest = readings[readings.length - 1];
  const previous = readings.length > 1 ? readings[readings.length - 2] : undefined;
  const trend = previous ? computeTrend(previous.value, latest.value) : "flat";

  return {
    loinc: marker.loinc[0],
    label: marker.label,
    latest,
    previous,
    trend,
    withinTarget: isWithinTarget(latest.value, marker),
    status: markerStatus(latest, previous, trend, marker),
    target: describeTarget(marker),
  };
}

/** Combine per-marker statuses into an overall condition status. */
function combineStatuses(statuses: ControlStatus[]): ControlStatus {
  if (statuses.length === 0) return "unmonitored";
  if (statuses.includes("worsening")) return "worsening";
  if (statuses.every((status) => status === "controlled")) return "controlled";
  if (statuses.includes("improving")) return "improving";
  if (statuses.includes("insufficient-data")) return "insufficient-data";
  return "unmonitored";
}

function medicationName(med: FhirMedicationRequest): string {
  return (
    conceptLabel(med.medicationCodeableConcept) ??
    med.medicationReference?.display?.trim() ??
    "Unknown medication"
  );
}

/** Best-effort: meds whose reason references/codes point at this condition. */
function medicationsForCondition(
  condition: FhirCondition,
  conditionName: string,
  medications: FhirMedicationRequest[],
): string[] {
  const conditionRef = condition.id ? `Condition/${condition.id}` : undefined;
  const nameLower = conditionName.toLowerCase();
  const names = new Set<string>();

  for (const med of medications) {
    const byReference = med.reasonReference?.some(
      (ref) => ref.reference && conditionRef && ref.reference === conditionRef,
    );
    const byCode = med.reasonCode?.some((code) =>
      conceptLabel(code)?.toLowerCase().includes(nameLower),
    );
    if (byReference || byCode) {
      names.add(medicationName(med));
    }
  }

  return [...names];
}

function statusPhrase(status: ControlStatus): string {
  switch (status) {
    case "controlled":
      return "appears controlled";
    case "improving":
      return "is out of target but improving";
    case "worsening":
      return "appears uncontrolled and not improving";
    case "insufficient-data":
      return "is out of target, but there is not enough history to judge a trend";
    case "unmonitored":
      return "has no monitoring markers on file to assess control";
  }
}

function buildRationale(
  status: ControlStatus,
  markers: MarkerAssessment[],
): string {
  if (markers.length === 0) {
    return `This condition ${statusPhrase(status)}.`;
  }
  const parts = markers.map((marker) => {
    const trendText =
      marker.previous
        ? ` (was ${marker.previous.value} ${marker.previous.unit} on ${marker.previous.date}, trend ${marker.trend})`
        : "";
    const targetText = marker.target ? `, target ${marker.target}` : "";
    return `${marker.label} ${marker.latest.value} ${marker.latest.unit} on ${marker.latest.date}${targetText}${trendText}`;
  });
  return `This condition ${statusPhrase(status)}. ${parts.join("; ")}.`;
}

export function assessConditionControl(
  conditions: FhirCondition[],
  observations: FhirObservation[],
  medications: FhirMedicationRequest[],
): ConditionAssessment[] {
  const assessments: ConditionAssessment[] = [];

  for (const condition of conditions) {
    if (!isActiveCondition(condition)) continue;

    const conditionName = conceptLabel(condition.code) ?? "Unknown condition";
    const profile = matchConditionProfile(conditionName);

    const markerAssessments: MarkerAssessment[] = [];
    if (profile) {
      for (const marker of profile.markers) {
        const assessment = assessMarker(observations, marker);
        if (assessment) markerAssessments.push(assessment);
      }
    }

    const status = combineStatuses(markerAssessments.map((m) => m.status));

    assessments.push({
      conditionId: condition.id,
      conditionName,
      status,
      markers: markerAssessments,
      medications: medicationsForCondition(condition, conditionName, medications),
      rationale: buildRationale(status, markerAssessments),
    });
  }

  return assessments;
}
