import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPatient, getPatient, updatePatient } from "@/lib/fhir-client";
import { formValuesToPatient, patientToFormValues } from "@/lib/fhir-patient";
import {
  defaultPatientFormValues,
  patientFormSchema,
  type PatientFormSchema,
} from "@/lib/validation";
import type { FhirPatient } from "@/types/fhir";
import {
  ADDRESS_USE_OPTIONS,
  CONTACT_RELATIONSHIP_OPTIONS,
  IDENTIFIER_USE_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  TELECOM_SYSTEM_OPTIONS,
  TELECOM_USE_OPTIONS,
} from "@/types/fhir";

interface PatientFormProps {
  open: boolean;
  patientId: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

export function PatientForm({
  open,
  patientId,
  onOpenChange,
  onSuccess,
  onError,
}: PatientFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [loadingPatient, setLoadingPatient] = useState(false);
  const [existingPatient, setExistingPatient] = useState<FhirPatient | undefined>();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PatientFormSchema>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: defaultPatientFormValues,
  });

  const gender = watch("gender");
  const active = watch("active");
  const identifierUse = watch("identifierUse");
  const telecomSystem = watch("telecomSystem");
  const telecomUse = watch("telecomUse");
  const addressUse = watch("addressUse");
  const maritalStatusCode = watch("maritalStatusCode");
  const contactRelationshipCode = watch("contactRelationshipCode");

  useEffect(() => {
    if (!open) return;

    if (!patientId) {
      setExistingPatient(undefined);
      reset(defaultPatientFormValues);
      return;
    }

    let cancelled = false;
    setLoadingPatient(true);
    getPatient(patientId)
      .then((patient) => {
        if (cancelled) return;
        setExistingPatient(patient);
        reset(patientToFormValues(patient));
      })
      .catch((err: Error) => onError(err.message))
      .finally(() => {
        if (!cancelled) setLoadingPatient(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, patientId, reset, onError]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const resource = formValuesToPatient(values, existingPatient);
      if (patientId) {
        await updatePatient(resource);
      } else {
        await createPatient(resource);
      }
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save patient");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{patientId ? "Edit Patient" : "New Patient"}</DialogTitle>
        </DialogHeader>

        {loadingPatient ? (
          <p className="text-sm text-muted-foreground">Loading patient...</p>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <FormSection title="Demographics">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="given">Given name</Label>
                  <Input id="given" {...register("given")} />
                  <FieldError message={errors.given?.message} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="family">Family name</Label>
                  <Input id="family" {...register("family")} />
                  <FieldError message={errors.family?.message} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select
                    value={gender}
                    onValueChange={(value) =>
                      setValue("gender", value as PatientFormSchema["gender"], {
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger id="gender">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.gender?.message} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="birthDate">Date of birth</Label>
                  <Input id="birthDate" type="date" {...register("birthDate")} />
                  <FieldError message={errors.birthDate?.message} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="active"
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={active}
                  onChange={(e) => setValue("active", e.target.checked)}
                />
                <Label htmlFor="active">Active patient</Label>
              </div>
            </FormSection>

            <FormSection title="Identifier">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="identifierUse">Use</Label>
                  <Select
                    value={identifierUse}
                    onValueChange={(value) => setValue("identifierUse", value)}
                  >
                    <SelectTrigger id="identifierUse">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IDENTIFIER_USE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="identifierSystem">System</Label>
                  <Input id="identifierSystem" {...register("identifierSystem")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="identifierValue">Value</Label>
                <Input
                  id="identifierValue"
                  placeholder="urn:uuid:..."
                  {...register("identifierValue")}
                />
              </div>
            </FormSection>

            <FormSection title="Telecom">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="telecomSystem">System</Label>
                  <Select
                    value={telecomSystem}
                    onValueChange={(value) => setValue("telecomSystem", value)}
                  >
                    <SelectTrigger id="telecomSystem">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TELECOM_SYSTEM_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telecomUse">Use</Label>
                  <Select
                    value={telecomUse}
                    onValueChange={(value) => setValue("telecomUse", value)}
                  >
                    <SelectTrigger id="telecomUse">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TELECOM_USE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telecomValue">Value</Label>
                  <Input id="telecomValue" placeholder="+1..." {...register("telecomValue")} />
                </div>
              </div>
            </FormSection>

            <FormSection title="Address">
              <div className="space-y-2">
                <Label htmlFor="addressUse">Use</Label>
                <Select
                  value={addressUse}
                  onValueChange={(value) => setValue("addressUse", value)}
                >
                  <SelectTrigger id="addressUse">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADDRESS_USE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressLine">Street</Label>
                <Input id="addressLine" {...register("addressLine")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="addressCity">City</Label>
                  <Input id="addressCity" {...register("addressCity")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addressPostalCode">Postal code</Label>
                  <Input id="addressPostalCode" {...register("addressPostalCode")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addressCountry">Country</Label>
                  <Input id="addressCountry" {...register("addressCountry")} />
                </div>
              </div>
            </FormSection>

            <FormSection title="Marital status">
              <div className="space-y-2">
                <Label htmlFor="maritalStatusCode">Status</Label>
                <Select
                  value={maritalStatusCode || "none"}
                  onValueChange={(value) =>
                    setValue("maritalStatusCode", value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger id="maritalStatusCode">
                    <SelectValue placeholder="Select marital status" />
                  </SelectTrigger>
                  <SelectContent>
                    {MARITAL_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.code || "none"} value={opt.code || "none"}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FormSection>

            <FormSection title="Contact">
              <div className="space-y-2">
                <Label htmlFor="contactRelationshipCode">Relationship</Label>
                <Select
                  value={contactRelationshipCode || "none"}
                  onValueChange={(value) =>
                    setValue("contactRelationshipCode", value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger id="contactRelationshipCode">
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_RELATIONSHIP_OPTIONS.map((opt) => (
                      <SelectItem key={opt.code || "none"} value={opt.code || "none"}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contactGiven">Contact given name</Label>
                  <Input id="contactGiven" {...register("contactGiven")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactFamily">Contact family name</Label>
                  <Input id="contactFamily" {...register("contactFamily")} />
                </div>
              </div>
            </FormSection>

            <FormSection title="General practitioner">
              <div className="space-y-2">
                <Label htmlFor="generalPractitionerReference">Organization reference</Label>
                <Input
                  id="generalPractitionerReference"
                  placeholder="Organization/1234567890"
                  {...register("generalPractitionerReference")}
                />
              </div>
            </FormSection>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : patientId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
