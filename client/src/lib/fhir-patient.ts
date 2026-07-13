import type { FhirPatient, PatientFormValues, PatientGender } from "@/types/fhir";
import { MARITAL_STATUS_OPTIONS } from "@/types/fhir";

const MARITAL_STATUS_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus";
const CONTACT_RELATIONSHIP_SYSTEM = "http://terminology.hl7.org/CodeSystem/v2-0131";

export function formatPatientName(patient: FhirPatient): string {
  const name = patient.name?.[0];
  if (!name) return "—";
  const given = name.given?.join(" ") ?? "";
  const family = name.family ?? "";
  return [given, family].filter(Boolean).join(" ").trim() || "—";
}

export function formatGender(gender?: PatientGender): string {
  if (!gender) return "—";
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}

export function formatPhone(patient: FhirPatient): string {
  return patient.telecom?.[0]?.value ?? "—";
}

export function formatAddressCity(patient: FhirPatient): string {
  const address = patient.address?.[0];
  if (!address) return "—";
  return [address.city, address.country].filter(Boolean).join(", ") || "—";
}

export function formatMaritalStatus(patient: FhirPatient): string {
  const code = patient.maritalStatus?.coding?.[0]?.code;
  if (!code) return "—";
  const match = MARITAL_STATUS_OPTIONS.find((o) => o.code === code);
  return match?.label ?? patient.maritalStatus?.coding?.[0]?.display ?? code;
}

export function formatActive(active?: boolean): string {
  if (active === undefined) return "—";
  return active ? "Active" : "Inactive";
}

export function patientToFormValues(patient: FhirPatient): PatientFormValues {
  const name = patient.name?.[0];
  const identifier = patient.identifier?.[0];
  const telecom = patient.telecom?.[0];
  const address = patient.address?.[0];
  const contact = patient.contact?.[0];
  const gp = patient.generalPractitioner?.[0];

  return {
    given: name?.given?.[0] ?? "",
    family: name?.family ?? "",
    active: patient.active ?? true,
    gender: patient.gender ?? "unknown",
    birthDate: patient.birthDate ?? "",
    identifierUse: identifier?.use ?? "official",
    identifierSystem: identifier?.system ?? "urn:ietf:rfc:3986",
    identifierValue: identifier?.value ?? "",
    telecomSystem: telecom?.system ?? "phone",
    telecomValue: telecom?.value ?? "",
    telecomUse: telecom?.use ?? "home",
    addressUse: address?.use ?? "home",
    addressLine: address?.line?.[0] ?? "",
    addressCity: address?.city ?? "",
    addressPostalCode: address?.postalCode ?? "",
    addressCountry: address?.country ?? "",
    maritalStatusCode: patient.maritalStatus?.coding?.[0]?.code ?? "",
    contactRelationshipCode: contact?.relationship?.[0]?.coding?.[0]?.code ?? "",
    contactGiven: contact?.name?.given?.[0] ?? "",
    contactFamily: contact?.name?.family ?? "",
    generalPractitionerReference: gp?.reference ?? "",
  };
}

function maritalDisplay(code: string): string {
  return MARITAL_STATUS_OPTIONS.find((o) => o.code === code)?.label ?? code;
}

export function formValuesToPatient(
  values: PatientFormValues,
  existing?: FhirPatient
): FhirPatient {
  const base: FhirPatient = existing ? { ...existing } : { resourceType: "Patient" };

  const fullName = [values.given, values.family].filter(Boolean).join(" ").trim();

  const patient: FhirPatient = {
    ...base,
    resourceType: "Patient",
    active: values.active,
    name: [
      {
        use: "official",
        family: values.family,
        given: [values.given],
      },
    ],
    gender: values.gender,
    birthDate: values.birthDate,
    text: {
      status: "generated",
      div: `<div xmlns="http://www.w3.org/1999/xhtml">Patient ${fullName}</div>`,
    },
  };

  if (values.identifierValue.trim()) {
    patient.identifier = [
      {
        use: values.identifierUse || "official",
        system: values.identifierSystem || "urn:ietf:rfc:3986",
        value: values.identifierValue.trim(),
      },
    ];
  } else {
    delete patient.identifier;
  }

  if (values.telecomValue.trim()) {
    patient.telecom = [
      {
        system: values.telecomSystem || "phone",
        value: values.telecomValue.trim(),
        use: values.telecomUse || "home",
      },
    ];
  } else {
    delete patient.telecom;
  }

  if (
    values.addressLine.trim() ||
    values.addressCity.trim() ||
    values.addressPostalCode.trim() ||
    values.addressCountry.trim()
  ) {
    patient.address = [
      {
        use: values.addressUse || "home",
        line: values.addressLine.trim() ? [values.addressLine.trim()] : undefined,
        city: values.addressCity.trim() || undefined,
        postalCode: values.addressPostalCode.trim() || undefined,
        country: values.addressCountry.trim() || undefined,
      },
    ];
  } else {
    delete patient.address;
  }

  if (values.maritalStatusCode) {
    patient.maritalStatus = {
      coding: [
        {
          system: MARITAL_STATUS_SYSTEM,
          code: values.maritalStatusCode,
          display: maritalDisplay(values.maritalStatusCode),
        },
      ],
    };
  } else {
    delete patient.maritalStatus;
  }

  if (
    values.contactGiven.trim() ||
    values.contactFamily.trim() ||
    values.contactRelationshipCode
  ) {
    patient.contact = [
      {
        relationship: values.contactRelationshipCode
          ? [
              {
                coding: [
                  {
                    system: CONTACT_RELATIONSHIP_SYSTEM,
                    code: values.contactRelationshipCode,
                  },
                ],
              },
            ]
          : undefined,
        name: {
          family: values.contactFamily.trim() || undefined,
          given: values.contactGiven.trim() ? [values.contactGiven.trim()] : undefined,
        },
      },
    ];
  } else {
    delete patient.contact;
  }

  if (values.generalPractitionerReference.trim()) {
    patient.generalPractitioner = [
      { reference: values.generalPractitionerReference.trim() },
    ];
  } else {
    delete patient.generalPractitioner;
  }

  return patient;
}
