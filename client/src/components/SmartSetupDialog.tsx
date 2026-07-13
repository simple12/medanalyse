import { useEffect, useState } from "react";
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
import { useFhirSource } from "@/lib/fhir-source-context";
import {
  configureSmartSource,
  fetchDeploymentStatus,
} from "@/lib/fhir-source-api";
import type { FhirSourceId } from "@/types/fhir-source";

const DEFAULT_ISSUERS: Partial<Record<FhirSourceId, string>> = {
  cerner:
    "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d",
  epic: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4",
};

export function SmartSetupDialog() {
  const {
    pendingSetupSource,
    setPendingSetupSource,
    sources,
    refreshSources,
    setPendingSmartSource,
  } = useFhirSource();

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [issuer, setIssuer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployMessage, setDeployMessage] = useState<string | null>(null);

  const source = sources.find((item) => item.id === pendingSetupSource);

  useEffect(() => {
    if (!pendingSetupSource) {
      setClientId("");
      setClientSecret("");
      setIssuer("");
      setError(null);
      setDeployMessage(null);
      return;
    }
    setIssuer(DEFAULT_ISSUERS[pendingSetupSource] ?? "");
  }, [pendingSetupSource]);

  if (!pendingSetupSource || !source) {
    return null;
  }

  const label = source.label;
  const cernerConfidentialHint = pendingSetupSource === "cerner";
  const epicPublicHint = pendingSetupSource === "epic";

  const waitForDeployment = async (deploymentId: string) => {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      const status = await fetchDeploymentStatus(deploymentId);
      setDeployMessage(`Redeploy status: ${status.readyState}`);
      if (status.readyState === "READY") {
        return;
      }
      if (status.readyState === "ERROR" || status.readyState === "CANCELED") {
        throw new Error(`Deployment failed with state ${status.readyState}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error("Timed out waiting for Vercel redeploy");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setDeployMessage(null);
    try {
      const result = await configureSmartSource({
        source: pendingSetupSource,
        clientId: clientId.trim(),
        issuer: issuer.trim(),
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
      });

      if (result.mode === "vercel" && result.deploymentId) {
        setDeployMessage(result.message ?? "Saving credentials and redeploying…");
        await waitForDeployment(result.deploymentId);
        window.location.reload();
        return;
      }

      const updatedSources = await refreshSources();
      const updated = updatedSources.find((item) => item.id === pendingSetupSource);
      setPendingSetupSource(null);
      if (updated?.configured) {
        setPendingSmartSource(pendingSetupSource);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to save SMART app credentials",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setPendingSetupSource(null);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure {label}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Enter your SMART app credentials from the {label} developer portal.
            {cernerConfidentialHint
              ? " If Application Privacy is Confidential in Code Console, paste the client secret from Cerner Central System Account Details (not a made-up value). Public Patient apps can leave the secret blank."
              : epicPublicHint
                ? " Epic sandbox public apps typically use PKCE without a client secret — leave the secret blank unless your app is registered as confidential."
                : null}{" "}
            On Vercel, these are saved as encrypted environment variables and a
            production redeploy is triggered automatically.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="smart-client-id">Client ID</Label>
            <Input
              id="smart-client-id"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smart-client-secret">
              Client secret
              {cernerConfidentialHint
                ? " (Confidential apps)"
                : epicPublicHint
                  ? " (optional for public Epic apps)"
                  : ""}
            </Label>
            <Input
              id="smart-client-secret"
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              autoComplete="off"
              placeholder={
                cernerConfidentialHint
                  ? "From Cerner Central System Account Details"
                  : epicPublicHint
                    ? "Leave blank for Epic public sandbox apps"
                    : undefined
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smart-setup-issuer">FHIR issuer URL</Label>
            <Input
              id="smart-setup-issuer"
              value={issuer}
              onChange={(event) => setIssuer(event.target.value)}
              placeholder="https://fhir.example.com/r4/..."
            />
          </div>
          {deployMessage ? (
            <p className="text-sm text-muted-foreground">{deployMessage}</p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !clientId.trim() || !issuer.trim()}
          >
            {submitting ? "Saving…" : `Save ${label} credentials`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
