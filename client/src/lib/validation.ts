import { z } from "zod";

const optionalString = z.string().trim();

export const patientFormSchema = z.object({
  given: z.string().trim().min(1, "Given name is required"),
  family: z.string().trim().min(1, "Family name is required"),
  active: z.boolean(),
  gender: z.enum(["male", "female", "other", "unknown"], {
    message: "Gender is required",
  }),
  birthDate: z
    .string()
    .min(1, "Date of birth is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  identifierUse: optionalString,
  identifierSystem: optionalString,
  identifierValue: optionalString,
  telecomSystem: optionalString,
  telecomValue: optionalString,
  telecomUse: optionalString,
  addressUse: optionalString,
  addressLine: optionalString,
  addressCity: optionalString,
  addressPostalCode: optionalString,
  addressCountry: optionalString,
  maritalStatusCode: optionalString,
  contactRelationshipCode: optionalString,
  contactGiven: optionalString,
  contactFamily: optionalString,
  generalPractitionerReference: optionalString,
});

export type PatientFormSchema = z.infer<typeof patientFormSchema>;

export const defaultPatientFormValues: PatientFormSchema = {
  given: "",
  family: "",
  active: true,
  gender: "unknown",
  birthDate: "",
  identifierUse: "official",
  identifierSystem: "urn:ietf:rfc:3986",
  identifierValue: "",
  telecomSystem: "phone",
  telecomValue: "",
  telecomUse: "home",
  addressUse: "home",
  addressLine: "",
  addressCity: "",
  addressPostalCode: "",
  addressCountry: "",
  maritalStatusCode: "",
  contactRelationshipCode: "",
  contactGiven: "",
  contactFamily: "",
  generalPractitionerReference: "",
};
