/**
 * Curated orderable drugs for Journey B1 demo (mirrors shared/agent/ddinter dataset).
 * Kept client-side so the picker works without an extra round-trip.
 */
export const ORDERABLE_DRUGS: ReadonlyArray<{ rxnorm: string; display: string }> = [
  { rxnorm: "1191", display: "aspirin" },
  { rxnorm: "11289", display: "warfarin" },
  { rxnorm: "32968", display: "clopidogrel" },
  { rxnorm: "5640", display: "ibuprofen" },
  { rxnorm: "161", display: "acetaminophen" },
  { rxnorm: "29046", display: "lisinopril" },
  { rxnorm: "6809", display: "metformin" },
  { rxnorm: "36567", display: "simvastatin" },
  { rxnorm: "83367", display: "atorvastatin" },
  { rxnorm: "11124", display: "potassium chloride" },
];
