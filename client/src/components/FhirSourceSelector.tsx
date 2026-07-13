import { Database, Link2, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFhirSource } from "@/lib/fhir-source-context";
import type { FhirSourceId } from "@/types/fhir-source";
import { isSmartSource } from "@/types/fhir-source";
import { cn } from "@/lib/utils";

interface FhirSourceSelectorProps {
  className?: string;
}

function statusLabel(source: {
  id: FhirSourceId;
  authType: string;
  configured: boolean;
  connected: boolean;
}): string {
  if (isSmartSource(source.id)) {
    if (!source.configured) return "Setup required";
    return source.connected ? "Connected" : "Sign in required";
  }
  if (source.authType === "static") {
    return source.connected ? "Connected" : "Token required";
  }
  return "Ready";
}

export function FhirSourceSelector({ className }: FhirSourceSelectorProps) {
  const {
    sources,
    sourceId,
    fhirHost,
    loading,
    selectSource,
    disconnectSmartSource,
  } = useFhirSource();

  const active = sources.find((item) => item.id === sourceId);
  const activeStatus = active ? statusLabel(active) : "Loading";
  const showSignOut =
    active && isSmartSource(active.id) && active.configured && active.connected;

  const handleChange = (value: string) => {
    void selectSource(value as FhirSourceId);
  };

  return (
    <div className={cn("flex flex-col items-start gap-2 sm:items-end", className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Database className="h-3.5 w-3.5" />
        {fhirHost ? <span>{fhirHost}</span> : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="fhir-source" className="text-xs text-muted-foreground">
            FHIR source
          </Label>
          <Select
            value={sourceId ?? undefined}
            onValueChange={handleChange}
            disabled={loading || sources.length === 0}
          >
            <SelectTrigger id="fhir-source" className="min-w-[220px]">
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              {sources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  <div className="flex flex-col">
                    <span>{source.label}</span>
                    <span className="text-xs text-muted-foreground">{source.subtitle}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs",
              activeStatus === "Connected" || activeStatus === "Ready"
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-900",
            )}
          >
            {activeStatus === "Connected" || activeStatus === "Ready" ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            {activeStatus}
          </div>
          {showSignOut && active ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => void disconnectSmartSource(active.id)}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
