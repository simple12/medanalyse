import { applySmartSourceOverrides } from "./smart-source-overrides.js";

export type FhirSourceId = "hapi" | "medblocks" | "cerner" | "epic";
export type AuthType = "none" | "static" | "smart";

export interface FhirSourceConfig {
  id: FhirSourceId;
  label: string;
  subtitle: string;
  baseUrl: string;
  authType: AuthType;
  accessToken?: string;
  smart?: {
    clientId: string;
    clientSecret?: string;
    scopes: string;
    issuer?: string;
    requiresIssuerInput?: boolean;
  };
}

export interface PublicFhirSource {
  id: FhirSourceId;
  label: string;
  subtitle: string;
  authType: AuthType;
  host: string;
  issuerUrl?: string;
  requiresIssuerInput: boolean;
  configured: boolean;
  connected: boolean;
}

export interface ResolvedFhirConnection {
  sourceId: FhirSourceId;
  baseUrl: string;
  accessToken?: string;
  label: string;
  host: string;
}

const SOURCE_IDS: FhirSourceId[] = ["hapi", "medblocks", "cerner", "epic"];

const DEFAULT_SUBTITLES: Record<FhirSourceId, string> = {
  hapi: "Public sandbox / local",
  medblocks: "Pre-configured tenant",
  cerner: "SMART login required",
  epic: "SMART login required",
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function hostFromUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
}

function parseSourcesJson(raw: string): FhirSourceConfig[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("FHIR_SOURCES_JSON must be a JSON array");
  }
  return parsed.map((entry) => {
    const item = entry as Partial<FhirSourceConfig>;
    if (!item.id || !SOURCE_IDS.includes(item.id)) {
      throw new Error(`Invalid source id in FHIR_SOURCES_JSON: ${String(item.id)}`);
    }
    if (!item.label || !item.baseUrl || !item.authType) {
      throw new Error(`Source ${item.id} missing label, baseUrl, or authType`);
    }
    return {
      id: item.id,
      label: item.label,
      subtitle: item.subtitle ?? DEFAULT_SUBTITLES[item.id],
      baseUrl: normalizeBaseUrl(item.baseUrl),
      authType: item.authType,
      accessToken: item.accessToken,
      smart: item.smart,
    };
  });
}

export function isSmartSourceConfigured(source: FhirSourceConfig): boolean {
  if (source.authType !== "smart") return true;
  return Boolean(source.smart?.clientId?.trim());
}

export function normalizeCernerScopes(scopes: string): string {
  return scopes
    .split(/\s+/)
    .filter((scope) => scope && scope !== "offline_access" && !scope.startsWith("user/"))
    .join(" ");
}

export function buildCernerAuthorizeScopes(scopes: string, launch?: string): string {
  const normalized = normalizeCernerScopes(scopes);
  const parts = normalized.split(/\s+/).filter(Boolean);

  if (launch?.trim()) {
    // EHR launch: Cerner requires the `launch` scope and launch query param together.
    const withoutStandaloneLaunch = parts.filter((scope) => scope !== "launch/patient");
    if (!withoutStandaloneLaunch.includes("launch")) {
      withoutStandaloneLaunch.unshift("launch");
    }
    return withoutStandaloneLaunch.join(" ");
  }

  const withoutEhrLaunch = parts.filter((scope) => scope !== "launch");
  if (!withoutEhrLaunch.includes("launch/patient")) {
    withoutEhrLaunch.unshift("launch/patient");
  }
  return withoutEhrLaunch.join(" ");
}

/** Epic uses granular patient/*.read scopes; wildcards are unreliable in sandbox. */
export function normalizeEpicScopes(scopes: string): string {
  return scopes
    .split(/\s+/)
    .filter(Boolean)
    .map((scope) => scope.replace(/\.rs\b/gi, ".read").replace(/\.Read\b/g, ".read"))
    .filter((scope) => !scope.endsWith(".write") && scope !== "profile")
    .join(" ");
}

export function buildEpicAuthorizeScopes(scopes: string, launch?: string): string {
  const normalized = normalizeEpicScopes(scopes);
  const parts = normalized.split(/\s+/).filter(Boolean);

  if (launch?.trim()) {
    const withoutStandaloneLaunch = parts.filter((scope) => scope !== "launch/patient");
    if (!withoutStandaloneLaunch.includes("launch")) {
      withoutStandaloneLaunch.unshift("launch");
    }
    return withoutStandaloneLaunch.join(" ");
  }

  const withoutEhrLaunch = parts.filter((scope) => scope !== "launch");
  if (!withoutEhrLaunch.includes("launch/patient")) {
    withoutEhrLaunch.unshift("launch/patient");
  }
  return withoutEhrLaunch.join(" ");
}

function buildSmartSource(
  id: "cerner" | "epic",
  env: NodeJS.ProcessEnv,
  defaults: {
    label: string;
    defaultBaseUrl: string;
    defaultScopes: string;
    clientIdKey: string;
    clientSecretKey: string;
    issuerKey: string;
    baseUrlKey: string;
    scopesKey: string;
  },
): FhirSourceConfig {
  const clientId = env[defaults.clientIdKey]?.trim();
  const issuer = env[defaults.issuerKey]?.trim();
  const baseUrl = normalizeBaseUrl(
    env[defaults.baseUrlKey]?.trim() || issuer || defaults.defaultBaseUrl,
  );

  return {
    id,
    label: defaults.label,
    subtitle: DEFAULT_SUBTITLES[id],
    baseUrl,
    authType: "smart",
    smart: clientId
      ? {
          clientId,
          clientSecret: env[defaults.clientSecretKey]?.trim(),
          scopes:
            id === "cerner"
              ? normalizeCernerScopes(
                  env[defaults.scopesKey]?.trim() || defaults.defaultScopes,
                )
              : normalizeEpicScopes(
                  env[defaults.scopesKey]?.trim() || defaults.defaultScopes,
                ),
          issuer,
          requiresIssuerInput: !issuer,
        }
      : undefined,
  };
}

function buildDefaultRegistry(env: NodeJS.ProcessEnv): FhirSourceConfig[] {
  const sources: FhirSourceConfig[] = [
    {
      id: "hapi",
      label: "HAPI",
      subtitle: DEFAULT_SUBTITLES.hapi,
      baseUrl: normalizeBaseUrl(
        env.HAPI_FHIR_BASE_URL?.trim() || "https://hapi.fhir.org/baseR4",
      ),
      authType: "none",
    },
  ];

  const medblocksUrl = env.FHIR_BASE_URL?.trim() || env.MEDBLOCKS_FHIR_BASE_URL?.trim();
  if (medblocksUrl) {
    sources.push({
      id: "medblocks",
      label: env.FHIR_SOURCE_LABEL?.trim() || "Medblocks",
      subtitle: DEFAULT_SUBTITLES.medblocks,
      baseUrl: normalizeBaseUrl(medblocksUrl),
      authType: "static",
      accessToken: env.FHIR_ACCESS_TOKEN?.trim() || env.MEDBLOCKS_FHIR_ACCESS_TOKEN?.trim(),
    });
  }

  sources.push(
    buildSmartSource("cerner", env, {
      label: "Cerner",
      defaultBaseUrl:
        "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d",
      defaultScopes:
        "openid fhirUser launch/patient profile patient/Patient.rs patient/Observation.rs patient/Condition.rs patient/MedicationRequest.rs patient/Procedure.rs patient/DiagnosticReport.rs patient/MedicationDispense.rs",
      clientIdKey: "CERNER_CLIENT_ID",
      clientSecretKey: "CERNER_CLIENT_SECRET",
      issuerKey: "CERNER_ISSUER",
      baseUrlKey: "CERNER_FHIR_BASE_URL",
      scopesKey: "CERNER_SCOPES",
    }),
    buildSmartSource("epic", env, {
      label: "Epic",
      defaultBaseUrl: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4",
      defaultScopes:
        "openid fhirUser launch/patient patient/Patient.read patient/Observation.read patient/Condition.read patient/MedicationRequest.read offline_access",
      clientIdKey: "EPIC_CLIENT_ID",
      clientSecretKey: "EPIC_CLIENT_SECRET",
      issuerKey: "EPIC_ISSUER",
      baseUrlKey: "EPIC_FHIR_BASE_URL",
      scopesKey: "EPIC_SCOPES",
    }),
  );

  return sources;
}

export function buildSourceRegistry(env: NodeJS.ProcessEnv = process.env): FhirSourceConfig[] {
  const effectiveEnv = applySmartSourceOverrides(env);
  const json = effectiveEnv.FHIR_SOURCES_JSON?.trim();
  if (json) {
    return parseSourcesJson(json);
  }
  return buildDefaultRegistry(effectiveEnv);
}

export function getSourceById(
  registry: FhirSourceConfig[],
  sourceId: string | undefined,
): FhirSourceConfig | undefined {
  if (!sourceId) return registry[0];
  return registry.find((s) => s.id === sourceId);
}

export function toPublicSource(
  source: FhirSourceConfig,
  connected: boolean,
): PublicFhirSource {
  const configured = isSmartSourceConfigured(source);
  return {
    id: source.id,
    label: source.label,
    subtitle: source.subtitle,
    authType: source.authType,
    host: hostFromUrl(source.baseUrl),
    issuerUrl: source.smart?.issuer || source.baseUrl,
    requiresIssuerInput: configured ? Boolean(source.smart?.requiresIssuerInput) : false,
    configured,
    connected: configured ? connected : false,
  };
}

export function listPublicSources(
  registry: FhirSourceConfig[],
  connectedIds: Set<FhirSourceId>,
): PublicFhirSource[] {
  return registry.map((source) => {
    const connected = !isSmartSourceConfigured(source)
      ? false
      : source.authType === "smart"
        ? connectedIds.has(source.id)
        : source.authType === "static"
          ? Boolean(source.accessToken)
          : true;
    return toPublicSource(source, connected);
  });
}

export function resolveConnection(
  source: FhirSourceConfig,
  smartAccessToken?: string,
  issuerOverride?: string,
): ResolvedFhirConnection {
  const baseUrl = issuerOverride
    ? normalizeBaseUrl(issuerOverride)
    : source.baseUrl;

  if (source.authType === "smart") {
    if (!smartAccessToken) {
      throw new Error(`SMART login required for ${source.label}`);
    }
    return {
      sourceId: source.id,
      baseUrl,
      accessToken: smartAccessToken,
      label: source.label,
      host: hostFromUrl(baseUrl),
    };
  }

  return {
    sourceId: source.id,
    baseUrl,
    accessToken: source.accessToken || undefined,
    label: source.label,
    host: hostFromUrl(baseUrl),
  };
}

export function readSourceIdFromRequest(
  headers: Record<string, string | string[] | undefined>,
  cookieHeader?: string,
): string | undefined {
  const header = headers["x-fhir-source"];
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)fhir_source=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}
