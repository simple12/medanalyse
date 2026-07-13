import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  buildSmartLogoutUrl,
  fetchFhirSources,
  getAppConfig,
  logoutSmartSource,
} from "@/lib/fhir-source-api";
import { formatSmartLaunchError } from "@/lib/cerner-launch-errors";
import { clearSmartEhrLaunchGuards, clearVisibleAuthCookies } from "@/lib/smart-ehr-launch";
import {
  getActiveFhirSourceId,
  loadStoredFhirSourceId,
  setActiveFhirSourceId,
  clearStoredFhirSourceId,
} from "@/lib/fhir-source-storage";
import type { FhirSourceId, PublicFhirSource } from "@/types/fhir-source";
import { isSmartSource } from "@/types/fhir-source";

type FhirSourceContextValue = {
  sources: PublicFhirSource[];
  sourceId: FhirSourceId | null;
  fhirSourceLabel: string | null;
  fhirHost: string | null;
  loading: boolean;
  selectSource: (sourceId: FhirSourceId) => Promise<void>;
  refreshSources: () => Promise<PublicFhirSource[]>;
  sourceVersion: number;
  pendingSmartSource: FhirSourceId | null;
  setPendingSmartSource: (id: FhirSourceId | null) => void;
  pendingSetupSource: FhirSourceId | null;
  setPendingSetupSource: (id: FhirSourceId | null) => void;
  smartError: string | null;
  setSmartError: (message: string | null) => void;
  completeSourceSwitch: (
    sourceId: FhirSourceId,
    options?: { navigateTo?: string | null },
  ) => Promise<void>;
  disconnectSmartSource: (sourceId: FhirSourceId) => Promise<void>;
};

const FhirSourceContext = createContext<FhirSourceContextValue | null>(null);

export function FhirSourceProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [sources, setSources] = useState<PublicFhirSource[]>([]);
  const [sourceId, setSourceId] = useState<FhirSourceId | null>(null);
  const [fhirSourceLabel, setFhirSourceLabel] = useState<string | null>(null);
  const [fhirHost, setFhirHost] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceVersion, setSourceVersion] = useState(0);
  const [pendingSmartSource, setPendingSmartSource] = useState<FhirSourceId | null>(
    null,
  );
  const [pendingSetupSource, setPendingSetupSource] = useState<FhirSourceId | null>(
    null,
  );
  const [smartError, setSmartError] = useState<string | null>(null);

  const completeSourceSwitch = useCallback(
    async (id: FhirSourceId, options?: { navigateTo?: string | null }) => {
      const config = await getAppConfig(id);
      setFhirSourceLabel(config.fhirSource);
      setFhirHost(config.fhirHost);
      setSourceId(id);
      setActiveFhirSourceId(id);
      setSourceVersion((value) => value + 1);
      if (options?.navigateTo !== null) {
        navigate(options?.navigateTo ?? "/");
      }
    },
    [navigate],
  );

  const refreshSources = useCallback(async () => {
    const list = await fetchFhirSources();
    setSources(list);
    return list;
  }, []);

  const disconnectSmartSource = useCallback(
    async (id: FhirSourceId) => {
      clearSmartEhrLaunchGuards();
      clearVisibleAuthCookies();
      setSmartError(null);

      const activeId = sourceId ?? getActiveFhirSourceId();
      if (loadStoredFhirSourceId() === id) {
        clearStoredFhirSourceId();
      }

      if (activeId === id) {
        // Full navigation clears HttpOnly cookies more reliably than fetch().
        window.location.assign(buildSmartLogoutUrl(id, "/"));
        return;
      }

      await logoutSmartSource(id);
      await refreshSources();
      setSourceVersion((value) => value + 1);
    },
    [refreshSources, sourceId],
  );

  const selectSource = useCallback(
    async (nextId: FhirSourceId) => {
      const source = sources.find((item) => item.id === nextId);
      if (!source) return;

      if (isSmartSource(nextId) && !source.configured) {
        setPendingSetupSource(nextId);
        return;
      }

      if (isSmartSource(nextId) && !source.connected) {
        setPendingSmartSource(nextId);
        return;
      }

      await completeSourceSwitch(nextId);
    },
    [completeSourceSwitch, sources],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      try {
        const params = new URLSearchParams(window.location.search);
        const connectedSource = params.get("connected_source");
        const smartErrorParam = params.get("smart_error");
        let hadSmartError = false;
        if (smartErrorParam) {
          hadSmartError = true;
          setSmartError(formatSmartLaunchError(decodeURIComponent(smartErrorParam)));
          params.delete("smart_error");
          const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
          window.history.replaceState({}, "", next);
        }
        if (
          connectedSource === "hapi" ||
          connectedSource === "medblocks" ||
          connectedSource === "cerner" ||
          connectedSource === "epic"
        ) {
          clearSmartEhrLaunchGuards();
        }
        if (
          connectedSource === "hapi" ||
          connectedSource === "medblocks" ||
          connectedSource === "cerner" ||
          connectedSource === "epic"
        ) {
          setActiveFhirSourceId(connectedSource);
          params.delete("connected_source");
          const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
          window.history.replaceState({}, "", next);
        }

        const list = await refreshSources();

        if (
          connectedSource === "hapi" ||
          connectedSource === "medblocks" ||
          connectedSource === "cerner" ||
          connectedSource === "epic"
        ) {
          const connected = list.find((item) => item.id === connectedSource);
          if (connected?.connected) {
            const stayOnPatientPage = window.location.pathname.startsWith("/patient/");
            await completeSourceSwitch(
              connectedSource,
              stayOnPatientPage ? { navigateTo: null } : undefined,
            );
            return;
          }
        }

        const stored = loadStoredFhirSourceId();
        const preferred =
          stored && list.some((item) => item.id === stored)
            ? stored
            : list.find((item) => item.id === "medblocks")?.id ?? list[0]?.id ?? null;

        if (!preferred || cancelled) return;

        const preferredSource = list.find((item) => item.id === preferred);
        if (preferredSource && isSmartSource(preferred) && !preferredSource.configured) {
          setSourceId(preferred);
          setPendingSetupSource(preferred);
          return;
        }
        if (preferredSource && isSmartSource(preferred) && !preferredSource.connected) {
          setSourceId(preferred);
          if (!(hadSmartError && preferred === "cerner")) {
            setPendingSmartSource(preferred);
          }
          return;
        }

        const config = await getAppConfig(preferred);
        if (cancelled) return;
        setFhirSourceLabel(config.fhirSource);
        setFhirHost(config.fhirHost);
        setSourceId(preferred);
        setActiveFhirSourceId(preferred);
        setSourceVersion((value) => value + 1);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refreshSources, completeSourceSwitch]);

  const value = useMemo(
    () => ({
      sources,
      sourceId: sourceId ?? getActiveFhirSourceId(),
      fhirSourceLabel,
      fhirHost,
      loading,
      selectSource,
      refreshSources,
      sourceVersion,
      pendingSmartSource,
      setPendingSmartSource,
      pendingSetupSource,
      setPendingSetupSource,
      smartError,
      setSmartError,
      completeSourceSwitch,
      disconnectSmartSource,
    }),
    [
      sources,
      sourceId,
      fhirSourceLabel,
      fhirHost,
      loading,
      selectSource,
      refreshSources,
      sourceVersion,
      pendingSmartSource,
      pendingSetupSource,
      smartError,
      completeSourceSwitch,
      disconnectSmartSource,
    ],
  );

  return (
    <FhirSourceContext.Provider value={value}>{children}</FhirSourceContext.Provider>
  );
}

export function useFhirSource(): FhirSourceContextValue {
  const context = useContext(FhirSourceContext);
  if (!context) {
    throw new Error("useFhirSource must be used within FhirSourceProvider");
  }
  return context;
}
