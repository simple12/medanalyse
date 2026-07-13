#!/usr/bin/env node
/**
 * Generates referentially intact FHIR transaction bundles for local HAPI testing.
 * Output: seed/demo-clinical-bundle.json
 *
 * Usage: node scripts/generate-seed-bundle.mjs [patient-count]
 * Default patient count: 5
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "../seed/demo-clinical-bundle.json");

const PATIENT_COUNT = Math.max(1, parseInt(process.argv[2] ?? "5", 10) || 5);

const PATIENT_IDENTIFIER_SYSTEM = "urn:oid:demo:patient-ids";
const PRACTITIONER_IDENTIFIER_SYSTEM = "urn:oid:demo:practitioner-ids";

const LOINC = "http://loinc.org";

const PRACTITIONERS = [
  {
    slug: "alice-smith",
    uuid: "urn:uuid:demo-practitioner-001",
    identifier: "DEMO-ALICE-SMITH-001",
    name: { family: "Smith", given: ["Alice"], prefix: ["Dr."] },
    gender: "female",
  },
  {
    slug: "bob-wilson",
    uuid: "urn:uuid:demo-practitioner-002",
    identifier: "DEMO-BOB-WILSON-001",
    name: { family: "Wilson", given: ["Bob"], prefix: ["Dr."] },
    gender: "male",
  },
];

const VITALS = [
  { code: "8867-4", display: "Heart rate", unit: "/min", uom: "/min", base: 72, spread: 15 },
  { code: "8310-5", display: "Body temperature", unit: "°C", uom: "Cel", base: 36.8, spread: 0.8 },
  { code: "9279-1", display: "Respiratory rate", unit: "/min", uom: "/min", base: 16, spread: 4 },
  { code: "59408-5", display: "Oxygen saturation", unit: "%", uom: "%", base: 97, spread: 2 },
  { code: "8302-2", display: "Body height", unit: "cm", uom: "cm", base: 175, spread: 1 },
  { code: "29463-7", display: "Body weight", unit: "kg", uom: "kg", base: 78, spread: 3 },
  { code: "39156-5", display: "BMI", unit: "kg/m2", uom: "kg/m2", base: 25.5, spread: 1.2 },
  { code: "8480-6", display: "Systolic blood pressure", unit: "mmHg", uom: "mm[Hg]", base: 120, spread: 10 },
  { code: "8462-4", display: "Diastolic blood pressure", unit: "mmHg", uom: "mm[Hg]", base: 78, spread: 8 },
];

const PATIENT_TEMPLATES = [
  {
    slug: "john-doe",
    identifier: "DEMO-JOHN-DOE-001",
    given: "John",
    family: "Doe",
    gender: "male",
    birthDate: "1980-06-15",
    practitionerIndex: 0,
    vitalOffset: 0,
    readingCount: 5,
    conditions: [
      { code: "38341003", display: "Hypertension", onset: "2022-03-15", id: "COND-HYPERTENSION" },
      { code: "44054006", display: "Type 2 diabetes mellitus", onset: "2021-08-01", id: "COND-DIABETES" },
      { code: "195967001", display: "Asthma", onset: "2019-11-20", id: "COND-ASTHMA" },
    ],
    medications: [
      { code: "314076", display: "Lisinopril 10 MG Oral Tablet", status: "active", id: "MED-LISINOPRIL" },
      { code: "860975", display: "Metformin 500 MG Oral Tablet", status: "active", id: "MED-METFORMIN" },
      { code: "745679", display: "Albuterol inhaler", status: "completed", id: "MED-ALBUTEROL" },
    ],
  },
  {
    slug: "jane-smith",
    identifier: "DEMO-JANE-SMITH-001",
    given: "Jane",
    family: "Smith",
    gender: "female",
    birthDate: "1975-03-22",
    practitionerIndex: 0,
    vitalOffset: 2,
    readingCount: 5,
    conditions: [
      { code: "13645005", display: "Chronic obstructive lung disease", onset: "2020-05-10", id: "COND-COPD" },
      { code: "69896004", display: "Rheumatoid arthritis", onset: "2018-09-01", id: "COND-RA" },
    ],
    medications: [
      { code: "1049502", display: "Fluticasone inhaler", status: "active", id: "MED-FLUTICASONE" },
      { code: "197361", display: "Methotrexate 2.5 MG Oral Tablet", status: "active", id: "MED-METHOTREXATE" },
    ],
  },
  {
    slug: "mikki-nakamura",
    identifier: "DEMO-MIKKI-NAKAMURA-001",
    given: "Mikki",
    family: "Nakamura",
    gender: "male",
    birthDate: "1980-01-01",
    practitionerIndex: 1,
    vitalOffset: 4,
    readingCount: 4,
    conditions: [
      { code: "271737000", display: "Anemia", onset: "2023-01-12", id: "COND-ANEMIA" },
      { code: "55822004", display: "Hyperlipidemia", onset: "2019-06-30", id: "COND-LIPIDS" },
    ],
    medications: [
      { code: "617312", display: "Atorvastatin 20 MG Oral Tablet", status: "active", id: "MED-ATORVASTATIN" },
      { code: "259255", display: "Ferrous sulfate 325 MG Oral Tablet", status: "active", id: "MED-IRON" },
    ],
  },
  {
    slug: "maria-garcia",
    identifier: "DEMO-MARIA-GARCIA-001",
    given: "Maria",
    family: "Garcia",
    gender: "female",
    birthDate: "1992-11-08",
    practitionerIndex: 1,
    vitalOffset: 6,
    readingCount: 5,
    conditions: [
      { code: "48694002", display: "Anxiety disorder", onset: "2021-02-14", id: "COND-ANXIETY" },
      { code: "35489007", display: "Depressive disorder", onset: "2020-07-01", id: "COND-DEPRESSION" },
    ],
    medications: [
      { code: "312938", display: "Sertraline 50 MG Oral Tablet", status: "active", id: "MED-SERT" },
      { code: "197591", display: "Diazepam 5 MG Oral Tablet", status: "stopped", id: "MED-DIAZ" },
    ],
  },
  {
    slug: "robert-chen",
    identifier: "DEMO-ROBERT-CHEN-001",
    given: "Robert",
    family: "Chen",
    gender: "male",
    birthDate: "1968-04-30",
    practitionerIndex: 0,
    vitalOffset: 8,
    readingCount: 5,
    conditions: [
      { code: "84114007", display: "Heart failure", onset: "2017-12-01", id: "COND-HF" },
      { code: "38341003", display: "Hypertension", onset: "2015-03-20", id: "COND-HTN" },
      { code: "40930008", display: "Hypothyroidism", onset: "2016-08-15", id: "COND-HYPO" },
    ],
    medications: [
      { code: "197380", display: "Furosemide 40 MG Oral Tablet", status: "active", id: "MED-FURO" },
      { code: "966571", display: "Carvedilol 25 MG Oral Tablet", status: "active", id: "MED-CARV" },
      { code: "966222", display: "Levothyroxine 100 MCG Oral Tablet", status: "active", id: "MED-LEVO" },
    ],
  },
];

function round1(n) {
  return Math.round(n * 10) / 10;
}

function dates(count, startIso, daysApart = 21) {
  const start = new Date(startIso);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i * daysApart);
    return d.toISOString();
  });
}

function putEntry(resource, searchUrl, fullUrl) {
  return {
    fullUrl,
    resource,
    request: { method: "PUT", url: searchUrl },
  };
}

function buildPatientClinicalEntries(patient, practitioner) {
  const patientUuid = `urn:uuid:demo-patient-${patient.slug}`;
  const entries = [];
  const readingDates = dates(patient.readingCount, "2025-01-15T10:00:00Z");

  entries.push(
    putEntry(
      {
        resourceType: "Patient",
        identifier: [{ system: PATIENT_IDENTIFIER_SYSTEM, value: patient.identifier }],
        active: true,
        name: [{ use: "official", family: patient.family, given: [patient.given] }],
        gender: patient.gender,
        birthDate: patient.birthDate,
        generalPractitioner: [{ reference: practitioner.uuid }],
      },
      `Patient?identifier=${PATIENT_IDENTIFIER_SYSTEM}|${patient.identifier}`,
      patientUuid
    )
  );

  for (const vital of VITALS) {
    readingDates.forEach((dt, i) => {
      const jitter =
        (Math.sin(i + vital.code.charCodeAt(0) + patient.vitalOffset) + 1) * 0.5 - 0.25;
      const value = vital.base + vital.spread * jitter + patient.vitalOffset * 0.3;
      const obsId = `OBS-${patient.slug}-${vital.code}-${i + 1}`;
      entries.push(
        putEntry(
          {
            resourceType: "Observation",
            identifier: [{ system: "urn:oid:demo:observation-ids", value: obsId }],
            status: "final",
            code: { coding: [{ system: LOINC, code: vital.code, display: vital.display }] },
            subject: { reference: patientUuid },
            performer: [{ reference: practitioner.uuid }],
            effectiveDateTime: dt,
            valueQuantity: {
              value: round1(value),
              unit: vital.unit,
              system: "http://unitsofmeasure.org",
              code: vital.uom,
            },
          },
          `Observation?identifier=urn:oid:demo:observation-ids|${obsId}`,
          `urn:uuid:obs-${obsId}`
        )
      );
    });
  }

  for (const cond of patient.conditions) {
    const condId = `${cond.id}-${patient.slug}`;
    entries.push(
      putEntry(
        {
          resourceType: "Condition",
          identifier: [{ system: "urn:oid:demo:condition-ids", value: condId }],
          clinicalStatus: {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
                code: "active",
              },
            ],
          },
          code: {
            coding: [{ system: "http://snomed.info/sct", code: cond.code, display: cond.display }],
          },
          subject: { reference: patientUuid },
          recorder: { reference: practitioner.uuid },
          onsetDateTime: `${cond.onset}T00:00:00Z`,
        },
        `Condition?identifier=urn:oid:demo:condition-ids|${condId}`,
        `urn:uuid:${condId}`
      )
    );
  }

  for (const med of patient.medications) {
    const medId = `${med.id}-${patient.slug}`;
    entries.push(
      putEntry(
        {
          resourceType: "MedicationRequest",
          identifier: [{ system: "urn:oid:demo:medication-ids", value: medId }],
          status: med.status,
          intent: "order",
          medicationCodeableConcept: {
            coding: [
              {
                system: "http://www.nlm.nih.gov/research/umls/rxnorm",
                code: med.code,
                display: med.display,
              },
            ],
          },
          subject: { reference: patientUuid },
          requester: { reference: practitioner.uuid },
          authoredOn: "2025-01-10T09:00:00Z",
        },
        `MedicationRequest?identifier=urn:oid:demo:medication-ids|${medId}`,
        `urn:uuid:${medId}`
      )
    );
  }

  return entries;
}

const entries = [];

for (const pract of PRACTITIONERS) {
  entries.push(
    putEntry(
      {
        resourceType: "Practitioner",
        identifier: [{ system: PRACTITIONER_IDENTIFIER_SYSTEM, value: pract.identifier }],
        active: true,
        name: [{ use: "official", ...pract.name }],
        gender: pract.gender,
      },
      `Practitioner?identifier=${PRACTITIONER_IDENTIFIER_SYSTEM}|${pract.identifier}`,
      pract.uuid
    )
  );
}

const patients = PATIENT_TEMPLATES.slice(0, PATIENT_COUNT);
for (const patient of patients) {
  const practitioner = PRACTITIONERS[patient.practitionerIndex];
  entries.push(...buildPatientClinicalEntries(patient, practitioner));
}

const bundle = {
  resourceType: "Bundle",
  type: "transaction",
  entry: entries,
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(bundle, null, 2));
console.log(`Wrote ${entries.length} entries (${patients.length} patients) to ${OUT_PATH}`);
for (const p of patients) {
  console.log(`  - ${p.given} ${p.family} (${p.identifier})`);
}
