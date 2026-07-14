import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentApiError, requestInteractionCheck } from "@/lib/agent-api";
import { ORDERABLE_DRUGS } from "@/lib/orderable-drugs";
import { cn } from "@/lib/utils";
import type { CardIndicator, InteractionCheckResult } from "@/types/agent";

interface MedicationOrderDraftProps {
  patientId: string;
}

function IndicatorIcon({ indicator }: { indicator: CardIndicator }) {
  if (indicator === "warning") return <AlertTriangle className="h-5 w-5 text-amber-600" />;
  if (indicator === "critical") return <AlertTriangle className="h-5 w-5 text-red-600" />;
  if (indicator === "info") return <Info className="h-5 w-5 text-sky-600" />;
  return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
}

export function MedicationOrderDraft({ patientId }: MedicationOrderDraftProps) {
  const [selectedRxnorm, setSelectedRxnorm] = useState(ORDERABLE_DRUGS[3]?.rxnorm ?? "5640");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InteractionCheckResult | null>(null);

  const selected = useMemo(
    () => ORDERABLE_DRUGS.find((drug) => drug.rxnorm === selectedRxnorm) ?? ORDERABLE_DRUGS[0],
    [selectedRxnorm],
  );

  async function runCheck() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const check = await requestInteractionCheck(patientId, {
        rxnormCode: selected.rxnorm,
        display: selected.display,
      });
      setResult(check);
    } catch (err) {
      setResult(null);
      setError(
        err instanceof AgentApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Interaction check failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-start gap-2">
        <Pill className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">New medication order</h2>
          <p className="text-sm text-muted-foreground">
            Draft a drug, run the DDInter interaction check against this patient&apos;s chart, then
            review before submit. FHIR write is not enabled yet.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1 text-sm">
          <span className="text-muted-foreground">Proposed medication</span>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedRxnorm}
            onChange={(event) => setSelectedRxnorm(event.target.value)}
          >
            {ORDERABLE_DRUGS.map((drug) => (
              <option key={drug.rxnorm} value={drug.rxnorm}>
                {drug.display} (RxNorm {drug.rxnorm})
              </option>
            ))}
          </select>
        </label>
        <Button type="button" onClick={() => void runCheck()} disabled={loading || !selected}>
          {loading ? "Checking…" : "Check interactions"}
        </Button>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-start gap-2">
            <IndicatorIcon indicator={result.card.indicator} />
            <div>
              <p className="font-medium">{result.card.summary}</p>
              <p className="mt-1 text-sm text-muted-foreground">{result.card.detail}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Checked {new Date(result.generatedAt).toLocaleString()}
              </p>
            </div>
          </div>

          {result.findings.length > 0 ? (
            <ul className="space-y-2">
              {result.findings.map((finding) => (
                <li
                  key={`${finding.proposedRxnorm}-${finding.currentRxnorm}`}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm",
                    finding.severity === "major" && "border-red-200 bg-red-50",
                    finding.severity === "moderate" && "border-amber-200 bg-amber-50",
                    finding.severity === "minor" && "border-sky-200 bg-sky-50",
                  )}
                >
                  <p className="font-medium">
                    {finding.severity.toUpperCase()}: {finding.proposedDisplay} +{" "}
                    {finding.currentDisplay}
                  </p>
                  <p className="mt-1 text-muted-foreground">{finding.mechanism}</p>
                  {finding.currentMedicationRequestId ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Citation: MedicationRequest/{finding.currentMedicationRequestId}
                    </p>
                  ) : null}
                  {finding.alternatives.length > 0 ? (
                    <p className="mt-1 text-xs">
                      Alternatives:{" "}
                      {finding.alternatives
                        .map((alt) => `${alt.display} (RxNorm ${alt.rxnorm})`)
                        .join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : result.noKnownInteractionMessage ? (
            <p className="text-sm text-muted-foreground">{result.noKnownInteractionMessage}</p>
          ) : null}

          {result.allergyWarnings.length > 0 ? (
            <p className="text-sm text-red-800">
              Allergy warnings: {result.allergyWarnings.join(", ")}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center">
            <Button type="button" disabled title={result.submitBlockedReason}>
              Confirm order
            </Button>
            <p className="text-xs text-muted-foreground">{result.submitBlockedReason}</p>
          </div>

          <p className="text-xs text-muted-foreground">{result.card.disclaimer}</p>
        </div>
      ) : null}
    </section>
  );
}
