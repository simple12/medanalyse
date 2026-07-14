/**
 * Lookup helpers over the curated DDInter MVP subset.
 */

import {
  DDINTER_DRUGS,
  DDINTER_EVIDENCE,
  DDINTER_INTERACTIONS,
  type DdinterDrug,
  type DdinterInteraction,
  type InteractionSeverity,
} from "./dataset.js";

export {
  DDINTER_DRUGS,
  DDINTER_EVIDENCE,
  DDINTER_INTERACTIONS,
  ORDERABLE_DRUGS,
} from "./dataset.js";
export type {
  DdinterDrug,
  DdinterInteraction,
  InteractionSeverity,
} from "./dataset.js";

const RXNORM_SYSTEMS = [
  "http://www.nlm.nih.gov/research/umls/rxnorm",
  "urn:oid:2.16.840.1.113883.6.88",
];

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const interactionByPair = new Map<string, DdinterInteraction>();
for (const row of DDINTER_INTERACTIONS) {
  interactionByPair.set(pairKey(row.a, row.b), row);
}

const drugByRxnorm = new Map<string, DdinterDrug>();
const drugByAlias = new Map<string, DdinterDrug>();
for (const drug of DDINTER_DRUGS) {
  drugByRxnorm.set(drug.rxnorm, drug);
  for (const alias of drug.aliases) {
    drugByAlias.set(alias.toLowerCase(), drug);
  }
}

export function normalizeRxnormCode(code: string | undefined | null): string | undefined {
  const trimmed = code?.trim();
  return trimmed || undefined;
}

export function findDrugByRxnorm(rxnorm: string | undefined): DdinterDrug | undefined {
  const code = normalizeRxnormCode(rxnorm);
  if (!code) return undefined;
  return drugByRxnorm.get(code);
}

export function findDrugByDisplay(display: string | undefined): DdinterDrug | undefined {
  if (!display?.trim()) return undefined;
  const lower = display.trim().toLowerCase();
  const exact = drugByAlias.get(lower);
  if (exact) return exact;
  for (const [alias, drug] of drugByAlias) {
    if (lower.includes(alias) || alias.includes(lower)) return drug;
  }
  return undefined;
}

export function resolveDrugIdentity(input: {
  rxnormCode?: string;
  display?: string;
}): DdinterDrug | undefined {
  return (
    findDrugByRxnorm(input.rxnormCode) ||
    findDrugByDisplay(input.display)
  );
}

export function isRxnormSystem(system?: string): boolean {
  if (!system) return false;
  const s = system.toLowerCase();
  return RXNORM_SYSTEMS.some((known) => s.includes("rxnorm") || s === known.toLowerCase());
}

export function extractRxnormFromCodings(
  coding?: Array<{ system?: string; code?: string; display?: string }>,
): string | undefined {
  if (!coding?.length) return undefined;
  for (const entry of coding) {
    if (isRxnormSystem(entry.system) && entry.code?.trim()) {
      return entry.code.trim();
    }
  }
  return undefined;
}

export interface KnownInteractionHit {
  interaction: DdinterInteraction;
  proposed: DdinterDrug;
  current: DdinterDrug;
  severity: InteractionSeverity;
  alternatives: DdinterDrug[];
}

export function lookupInteraction(
  proposedRxnorm: string,
  currentRxnorm: string,
): DdinterInteraction | undefined {
  return interactionByPair.get(pairKey(proposedRxnorm, currentRxnorm));
}

export function findInteractionsForProposed(
  proposed: DdinterDrug,
  currentMeds: Array<{ rxnorm?: string; display?: string }>,
): KnownInteractionHit[] {
  const hits: KnownInteractionHit[] = [];
  const seen = new Set<string>();

  for (const med of currentMeds) {
    const current = resolveDrugIdentity(med);
    if (!current || current.rxnorm === proposed.rxnorm) continue;
    const interaction = lookupInteraction(proposed.rxnorm, current.rxnorm);
    if (!interaction) continue;
    const key = pairKey(proposed.rxnorm, current.rxnorm);
    if (seen.has(key)) continue;
    seen.add(key);

    const alternatives = interaction.alternatives
      .map((code) => findDrugByRxnorm(code))
      .filter((drug): drug is DdinterDrug => Boolean(drug))
      .filter((drug) => drug.rxnorm !== current.rxnorm);

    hits.push({
      interaction,
      proposed,
      current,
      severity: interaction.severity,
      alternatives,
    });
  }

  return hits.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function severityRank(severity: InteractionSeverity): number {
  if (severity === "major") return 3;
  if (severity === "moderate") return 2;
  return 1;
}

export function severityToIndicator(
  severity: InteractionSeverity,
): "info" | "warning" | "critical" {
  if (severity === "major") return "critical";
  if (severity === "moderate") return "warning";
  return "info";
}
