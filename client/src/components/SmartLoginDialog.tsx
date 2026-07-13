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
import { startSmartLogin } from "@/lib/fhir-source-api";
import type { FhirSourceId } from "@/types/fhir-source";

export function SmartLoginDialog() {
  const {
    pendingSmartSource,
    setPendingSmartSource,
    sources,
    refreshSources,
    completeSourceSwitch,
  } = useFhirSource();
  const [issuer, setIssuer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const source = sources.find((item) => item.id === pendingSmartSource);

  useEffect(() => {
    if (!source) {
      setIssuer("");
      setStatusMessage(null);
      return;
    }
    if (source.requiresIssuerInput) {
      setIssuer(source.issuerUrl ?? (source.host ? `https://${source.host}` : ""));
    } else {
      setIssuer("");
    }
  }, [source]);

  if (!pendingSmartSource || !source) {
    return null;
  }

  const label = source.label;

  const handleSignIn = async () => {
    setSubmitting(true);
    try {
      startSmartLogin(
        pendingSmartSource,
        source.requiresIssuerInput ? issuer.trim() || undefined : undefined,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setPendingSmartSource(null);
  };

  const handleRefreshAfterLogin = async () => {
    const updatedSources = await refreshSources();
    const updated = updatedSources.find((item) => item.id === pendingSmartSource);
    if (updated?.connected) {
      await completeSourceSwitch(pendingSmartSource as FhirSourceId);
      setPendingSmartSource(null);
      setStatusMessage(null);
      return;
    }
    setStatusMessage(`No active ${label} session found. Use Sign in with ${label} to authorize.`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in with {label}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {source.id === "cerner" ? (
              <>
                Standalone sign-in does not carry a patient from the Cerner sandbox chart.
                To open a specific patient (for example Timmy or Wilma Smart), use{" "}
                <strong>Test Sandbox</strong> in Cerner Code Console, pick that patient in the
                modal, then sign in with the matching portal account (for example{" "}
                <code className="text-xs">timmy_smart</code> / Cerner01).
              </>
            ) : source.id === "epic" ? (
              <>
                Register your app at{" "}
                <a
                  href="https://fhir.epic.com/"
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  fhir.epic.com
                </a>{" "}
                with redirect URI{" "}
                <code className="text-xs">/api/auth/smart/callback</code> on your deployed app URL.
                Use the <strong>Non-Production Client ID</strong> (public apps can leave the client
                secret blank). Standalone sign-in uses Epic MyChart sandbox test patients; EHR
                launch passes the patient from Hyperspace.
              </>
            ) : (
              "You will be redirected to authorize access. Use sandbox test accounts only."
            )}
          </p>
        </DialogHeader>

        {source.requiresIssuerInput ? (
          <div className="space-y-2">
            <Label htmlFor="smart-issuer">FHIR issuer URL</Label>
            <Input
              id="smart-issuer"
              value={issuer}
              onChange={(event) => setIssuer(event.target.value)}
              placeholder="https://fhir.example.com/r4/..."
            />
          </div>
        ) : null}

        {statusMessage ? (
          <p className="text-sm text-amber-900">{statusMessage}</p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void handleRefreshAfterLogin()}>
              I already signed in
            </Button>
            <Button type="button" onClick={handleSignIn} disabled={submitting}>
              Sign in with {label}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
