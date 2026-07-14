/**
 * Curated DDInter-inspired subset for Journey B1 MVP.
 * Not the full DDInter corpus. Lookups that miss must be phrased as
 * "no known interaction in this subset," never as "safe."
 */

export type InteractionSeverity = "minor" | "moderate" | "major";

export interface DdinterDrug {
  rxnorm: string;
  display: string;
  /** Lowercase name tokens used for fuzzy match when RxNorm is missing. */
  aliases: string[];
  therapeuticClass: string;
}

export interface DdinterInteraction {
  /** Lexicographically smaller RxNorm first for stable keys. */
  a: string;
  b: string;
  severity: InteractionSeverity;
  mechanism: string;
  /** Same-class or safer alternative suggestions (RxNorm codes). */
  alternatives: string[];
}

export const DDINTER_DRUGS: DdinterDrug[] = [
  {
    rxnorm: "1191",
    display: "aspirin",
    aliases: ["aspirin", "asa", "acetylsalicylic"],
    therapeuticClass: "antiplatelet",
  },
  {
    rxnorm: "11289",
    display: "warfarin",
    aliases: ["warfarin", "coumadin"],
    therapeuticClass: "anticoagulant",
  },
  {
    rxnorm: "32968",
    display: "clopidogrel",
    aliases: ["clopidogrel", "plavix"],
    therapeuticClass: "antiplatelet",
  },
  {
    rxnorm: "5640",
    display: "ibuprofen",
    aliases: ["ibuprofen", "advil", "motrin"],
    therapeuticClass: "nsaid",
  },
  {
    rxnorm: "161",
    display: "acetaminophen",
    aliases: ["acetaminophen", "paracetamol", "tylenol"],
    therapeuticClass: "analgesic",
  },
  {
    rxnorm: "29046",
    display: "lisinopril",
    aliases: ["lisinopril"],
    therapeuticClass: "ace-inhibitor",
  },
  {
    rxnorm: "6809",
    display: "metformin",
    aliases: ["metformin"],
    therapeuticClass: "antidiabetic",
  },
  {
    rxnorm: "36567",
    display: "simvastatin",
    aliases: ["simvastatin", "zocor"],
    therapeuticClass: "statin",
  },
  {
    rxnorm: "83367",
    display: "atorvastatin",
    aliases: ["atorvastatin", "lipitor"],
    therapeuticClass: "statin",
  },
  {
    rxnorm: "11124",
    display: "potassium chloride",
    aliases: ["potassium chloride", "kcl"],
    therapeuticClass: "electrolyte",
  },
];

export const DDINTER_INTERACTIONS: DdinterInteraction[] = [
  {
    a: "1191",
    b: "11289",
    severity: "major",
    mechanism:
      "Aspirin increases bleeding risk when combined with warfarin (antiplatelet + anticoagulant).",
    alternatives: ["161"],
  },
  {
    a: "1191",
    b: "5640",
    severity: "moderate",
    mechanism:
      "Ibuprofen may attenuate aspirin's antiplatelet effect and raise GI bleeding risk.",
    alternatives: ["161"],
  },
  {
    a: "11289",
    b: "5640",
    severity: "major",
    mechanism:
      "NSAIDs with warfarin increase gastrointestinal and systemic bleeding risk.",
    alternatives: ["161"],
  },
  {
    a: "1191",
    b: "32968",
    severity: "major",
    mechanism:
      "Dual antiplatelet therapy (aspirin + clopidogrel) substantially increases bleeding risk.",
    alternatives: ["161"],
  },
  {
    a: "29046",
    b: "11124",
    severity: "moderate",
    mechanism:
      "ACE inhibitors with potassium supplements can raise hyperkalemia risk.",
    alternatives: [],
  },
];

export const DDINTER_EVIDENCE = {
  source: "DDInter (curated MVP subset)",
  citation:
    "DDInter 2.0-inspired drug-drug interaction subset used for demo. Coverage is incomplete.",
  url: "https://ddinter.scbdd.com/",
} as const;

/** Drugs the order UI can propose without free-text RxNorm entry. */
export const ORDERABLE_DRUGS: ReadonlyArray<{ rxnorm: string; display: string }> =
  DDINTER_DRUGS.map((drug) => ({
    rxnorm: drug.rxnorm,
    display: drug.display,
  }));
