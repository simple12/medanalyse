export type FhirSourceId = "hapi" | "medblocks" | "cerner" | "epic";
export type AuthType = "none" | "static" | "smart";

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

export interface ConfigureSmartSourceInput {
  source: FhirSourceId;
  clientId: string;
  clientSecret?: string;
  issuer: string;
}

export interface ConfigureSmartSourceResponse {
  mode: "local" | "vercel";
  deploymentId?: string;
  deploymentUrl?: string;
  readyState?: string;
  message?: string;
  error?: string;
}

export interface DeploymentStatusResponse {
  deploymentId: string;
  readyState: string;
  deploymentUrl?: string;
}

export interface AppConfig {
  fhirSource: string;
  fhirHost: string;
  sourceId?: FhirSourceId;
}

export interface SmartAuthStatus {
  sourceId: FhirSourceId;
  connected: boolean;
  expiresAt?: number;
  patient?: string;
  iss?: string;
}

export const FHIR_SOURCE_STORAGE_KEY = "fhir_source_id";

export const SMART_SOURCE_IDS: FhirSourceId[] = ["cerner", "epic"];

export function isSmartSource(id: FhirSourceId): boolean {
  return SMART_SOURCE_IDS.includes(id);
}
