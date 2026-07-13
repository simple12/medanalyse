export type PatientGender = "male" | "female" | "other" | "unknown";

export interface HumanName {
  use?: string;
  family?: string;
  given?: string[];
}

export interface Identifier {
  use?: string;
  system?: string;
  value?: string;
}

export interface ContactPoint {
  system?: string;
  value?: string;
  use?: string;
}

export interface Address {
  use?: string;
  line?: string[];
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

export interface CodeableConcept {
  text?: string;
  coding?: Coding[];
}

export interface PatientContact {
  relationship?: CodeableConcept[];
  name?: HumanName;
}

export interface Reference {
  reference?: string;
  display?: string;
}

export interface FhirPatient {
  resourceType: "Patient";
  id?: string;
  text?: { status?: string; div?: string };
  identifier?: Identifier[];
  active?: boolean;
  name?: HumanName[];
  telecom?: ContactPoint[];
  gender?: PatientGender;
  birthDate?: string;
  address?: Address[];
  maritalStatus?: CodeableConcept;
  contact?: PatientContact[];
  generalPractitioner?: Reference[];
  [key: string]: unknown;
}

export interface FhirBundle {
  resourceType: "Bundle";
  type?: string;
  total?: number;
  entry?: Array<{ resource?: FhirResource }>;
}

export interface FhirResource {
  resourceType: string;
  id?: string;
  [key: string]: unknown;
}

export interface Quantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
}

export interface FhirObservation {
  resourceType: "Observation";
  id?: string;
  status?: string;
  code?: CodeableConcept;
  subject?: Reference;
  performer?: Reference[];
  effectiveDateTime?: string;
  effectivePeriod?: { start?: string; end?: string };
  valueQuantity?: Quantity;
  component?: Array<{
    code?: CodeableConcept;
    valueQuantity?: Quantity;
  }>;
  [key: string]: unknown;
}

export interface FhirCondition {
  resourceType: "Condition";
  id?: string;
  code?: CodeableConcept;
  subject?: Reference;
  onsetDateTime?: string;
  onsetPeriod?: { start?: string; end?: string };
  [key: string]: unknown;
}

export interface FhirMedicationRequest {
  resourceType: "MedicationRequest";
  id?: string;
  status?: string;
  authoredOn?: string;
  subject?: Reference;
  medicationCodeableConcept?: CodeableConcept;
  medicationReference?: Reference;
  [key: string]: unknown;
}

export interface FhirMedication {
  resourceType: "Medication";
  id?: string;
  code?: CodeableConcept;
  [key: string]: unknown;
}

export interface FhirPractitioner {
  resourceType: "Practitioner";
  id?: string;
  name?: HumanName[];
  [key: string]: unknown;
}

export interface OperationOutcome {
  resourceType: "OperationOutcome";
  issue?: Array<{ severity?: string; diagnostics?: string; details?: { text?: string } }>;
}

export interface PatientFormValues {
  given: string;
  family: string;
  active: boolean;
  gender: PatientGender;
  birthDate: string;
  identifierUse: string;
  identifierSystem: string;
  identifierValue: string;
  telecomSystem: string;
  telecomValue: string;
  telecomUse: string;
  addressUse: string;
  addressLine: string;
  addressCity: string;
  addressPostalCode: string;
  addressCountry: string;
  maritalStatusCode: string;
  contactRelationshipCode: string;
  contactGiven: string;
  contactFamily: string;
  generalPractitionerReference: string;
}

export const MARITAL_STATUS_OPTIONS = [
  { code: "", label: "Not specified" },
  { code: "S", label: "Never Married" },
  { code: "M", label: "Married" },
  { code: "D", label: "Divorced" },
  { code: "W", label: "Widowed" },
  { code: "L", label: "Legally Separated" },
  { code: "U", label: "Unmarried" },
  { code: "UNK", label: "Unknown" },
] as const;

export const CONTACT_RELATIONSHIP_OPTIONS = [
  { code: "", label: "Not specified" },
  { code: "C", label: "Emergency Contact" },
  { code: "E", label: "Employer" },
  { code: "F", label: "Federal Agency" },
  { code: "I", label: "Insurance Company" },
  { code: "N", label: "Next-of-Kin" },
  { code: "S", label: "State Agency" },
  { code: "U", label: "Unknown" },
] as const;

export const TELECOM_SYSTEM_OPTIONS = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "fax", label: "Fax" },
  { value: "pager", label: "Pager" },
  { value: "url", label: "URL" },
  { value: "sms", label: "SMS" },
  { value: "other", label: "Other" },
] as const;

export const TELECOM_USE_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "mobile", label: "Mobile" },
  { value: "temp", label: "Temporary" },
  { value: "old", label: "Old" },
] as const;

export const ADDRESS_USE_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "temp", label: "Temporary" },
  { value: "billing", label: "Billing" },
  { value: "old", label: "Old" },
] as const;

export const IDENTIFIER_USE_OPTIONS = [
  { value: "official", label: "Official" },
  { value: "usual", label: "Usual" },
  { value: "temp", label: "Temporary" },
  { value: "secondary", label: "Secondary" },
  { value: "old", label: "Old" },
] as const;
