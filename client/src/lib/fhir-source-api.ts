import type {
  AppConfig,
  ConfigureSmartSourceInput,
  ConfigureSmartSourceResponse,
  DeploymentStatusResponse,
  FhirSourceId,
  PublicFhirSource,
  SmartAuthStatus,
} from "@/types/fhir-source";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export async function fetchFhirSources(): Promise<PublicFhirSource[]> {
  const response = await fetch(`${API_BASE}/api/fhir-sources`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to load FHIR sources");
  }
  const data = (await response.json()) as { sources: PublicFhirSource[] };
  return data.sources;
}

export async function getAppConfig(sourceId?: FhirSourceId): Promise<AppConfig> {
  const headers: Record<string, string> = {};
  if (sourceId) {
    headers["X-FHIR-Source"] = sourceId;
  }
  const response = await fetch(`${API_BASE}/api/config`, {
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    throw new Error("Failed to load app configuration");
  }
  return (await response.json()) as AppConfig;
}

export async function fetchSmartStatus(sourceId: FhirSourceId): Promise<SmartAuthStatus> {
  const response = await fetch(
    `${API_BASE}/api/auth/smart/status?source=${encodeURIComponent(sourceId)}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    throw new Error("Failed to load SMART status");
  }
  return (await response.json()) as SmartAuthStatus;
}

export function startSmartLogin(
  sourceId: FhirSourceId,
  issuer?: string,
  launch?: string,
): void {
  const params = new URLSearchParams({ source: sourceId, redirect: "/" });
  if (issuer?.trim()) {
    params.set("iss", issuer.trim());
  }
  if (launch?.trim()) {
    params.set("launch", launch.trim());
  }
  window.location.href = `${API_BASE}/api/auth/smart/authorize?${params.toString()}`;
}

export function buildSmartLaunchAuthorizeUrl(iss: string, launch: string): string | null {
  const params = new URLSearchParams({
    iss: iss.trim(),
    launch: launch.trim(),
    redirect: "/",
  });

  try {
    const host = new URL(iss.trim()).hostname.toLowerCase();
    if (host.includes("cerner")) {
      params.set("source", "cerner");
    } else if (host.includes("epic")) {
      params.set("source", "epic");
    } else {
      return null;
    }
  } catch {
    return null;
  }

  return `${API_BASE}/api/auth/smart/authorize?${params.toString()}`;
}

export function buildSmartLogoutUrl(
  sourceId: FhirSourceId,
  redirectPath = "/",
): string {
  const params = new URLSearchParams({
    source: sourceId,
    redirect: redirectPath.startsWith("/") ? redirectPath : "/",
  });
  return `${API_BASE}/api/auth/smart/logout?${params.toString()}`;
}

export async function logoutSmartSource(sourceId: FhirSourceId): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/smart/logout`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: sourceId }),
  });
  if (!response.ok) {
    throw new Error("Failed to sign out");
  }
}

export async function configureSmartSource(
  input: ConfigureSmartSourceInput,
): Promise<ConfigureSmartSourceResponse> {
  const response = await fetch(`${API_BASE}/api/admin/configure-smart-source`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as ConfigureSmartSourceResponse;
  if (!response.ok) {
    throw new Error(data.error || "Failed to configure SMART source");
  }
  return data;
}

export async function fetchDeploymentStatus(
  deploymentId: string,
): Promise<DeploymentStatusResponse> {
  const response = await fetch(
    `${API_BASE}/api/admin/configure-smart-source?deploymentId=${encodeURIComponent(deploymentId)}`,
    { credentials: "include" },
  );
  const data = (await response.json()) as DeploymentStatusResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Failed to load deployment status");
  }
  return data;
}
