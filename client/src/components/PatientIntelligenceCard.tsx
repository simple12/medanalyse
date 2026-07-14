import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requestConditionReview } from "@/lib/agent-api";
import { cn } from "@/lib/utils";
import type {
  CardIndicator,
  ControlStatus,
  ConditionAssessment,
  ReviewResult,
} from "@/types/agent";

interface PatientIntelligenceCardProps {
  patientId: string;
  /** Bump to force a re-run (e.g. when the FHIR source changes). */
  reloadKey?: number;
}

const STATUS_STYLES: Record<ControlStatus, string> = {
  controlled: "bg-emerald-50 text-emerald-800 border-emerald-200",
  improving: "bg-sky-50 text-sky-800 border-sky-200",
  worsening: "bg-red-50 text-red-800 border-red-200",
  "insufficient-data": "bg-amber-50 text-amber-900 border-amber-200",
  unmonitored: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABELS: Record<ControlStatus, string> = {
  controlled: "Controlled",
  improving: "Improving",
  worsening: "Needs attention",
  "insufficient-data": "Insufficient data",
  unmonitored: "Not monitored",
};

function IndicatorIcon({ indicator }: { indicator: CardIndicator }) {
  if (indicator === "warning") return <AlertTriangle className="h-5 w-5 text-amber-600" />;
  if (indicator === "critical") return <AlertTriangle className="h-5 w-5 text-red-600" />;
  return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
}

function ConditionRow({ assessment }: { assessment: ConditionAssessment }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{assessment.conditionName}</span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
            STATUS_STYLES[assessment.status],
          )}
        >
          {STATUS_LABELS[assessment.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{assessment.rationale}</p>
      {assessment.medications.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Related medications: {assessment.medications.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

export function PatientIntelligenceCard({
  patientId,
  reloadKey = 0,
}: PatientIntelligenceCardProps) {
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await requestConditionReview(patientId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run patient review");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await requestConditionReview(patientId);
        if (!cancelled) setResult(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to run patient review");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, reloadKey]);

  return (
    <section className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Activity className="h-5 w-5 text-primary" />
          Patient Intelligence
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Re-run
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <IndicatorIcon indicator={result.card.indicator} />
            <div>
              <p className="font-medium">{result.card.summary}</p>
              <p className="text-xs text-muted-foreground">
                Generated {new Date(result.generatedAt).toLocaleString()}
              </p>
            </div>
          </div>

          {result.card.assessments.length > 0 ? (
            <div className="space-y-2">
              {result.card.assessments.map((assessment, index) => (
                <ConditionRow key={assessment.conditionId ?? index} assessment={assessment} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active conditions were found for this patient.
            </p>
          )}

          {result.card.recommendations.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Recommendations</h3>
              {result.card.recommendations.map((rec, index) => (
                <div
                  key={index}
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Info className="h-4 w-4" />
                    {rec.title}
                  </div>
                  <p className="mt-1">{rec.detail}</p>
                  {rec.evidence.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                      {rec.evidence.map((ev, evIndex) => (
                        <li key={evIndex}>
                          <span className="font-medium">{ev.source}:</span> {ev.citation}
                          {ev.url ? (
                            <>
                              {" "}
                              <a href={ev.url} className="underline" target="_blank" rel="noreferrer">
                                link
                              </a>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <p className="text-xs italic text-muted-foreground">{result.card.disclaimer}</p>
        </div>
      ) : null}
    </section>
  );
}
