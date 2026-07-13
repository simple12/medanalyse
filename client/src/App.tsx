import { Link, Outlet } from "react-router-dom";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FhirSourceSelector } from "@/components/FhirSourceSelector";
import { SmartLoginDialog } from "@/components/SmartLoginDialog";
import { SmartSetupDialog } from "@/components/SmartSetupDialog";
import { useFhirSource } from "@/lib/fhir-source-context";

export function AppLayout() {
  const { fhirSourceLabel, smartError, setSmartError } = useFhirSource();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link to="/" className="hover:opacity-90">
              <h1 className="text-2xl font-semibold tracking-tight">Patient Management</h1>
              <p className="text-sm text-muted-foreground">
                FHIR R4 Patient Administration
                {fhirSourceLabel ? (
                  <>
                    {" · "}
                    <span className="text-foreground/70">Source: {fhirSourceLabel}</span>
                  </>
                ) : null}
              </p>
            </Link>
          </div>
          <FhirSourceSelector />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Demo environment — use fictional data only.
        </div>
        <ErrorBanner message={smartError} onDismiss={() => setSmartError(null)} />
        <Outlet />
      </main>
      <SmartSetupDialog />
      <SmartLoginDialog />
    </div>
  );
}
