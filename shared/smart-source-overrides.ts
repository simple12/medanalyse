export interface SmartSourceCredentials {
  clientId: string;
  clientSecret?: string;
  issuer: string;
}

type SmartOverrideSourceId = "cerner" | "epic";

const overrides = new Map<SmartOverrideSourceId, SmartSourceCredentials>();

const ENV_KEYS: Record<"cerner" | "epic", { clientId: string; clientSecret: string; issuer: string }> = {
  cerner: {
    clientId: "CERNER_CLIENT_ID",
    clientSecret: "CERNER_CLIENT_SECRET",
    issuer: "CERNER_ISSUER",
  },
  epic: {
    clientId: "EPIC_CLIENT_ID",
    clientSecret: "EPIC_CLIENT_SECRET",
    issuer: "EPIC_ISSUER",
  },
};

export function setSmartSourceOverride(
  sourceId: "cerner" | "epic",
  credentials: SmartSourceCredentials,
): void {
  overrides.set(sourceId, credentials);
}

export function getSmartSourceOverride(
  sourceId: SmartOverrideSourceId,
): SmartSourceCredentials | undefined {
  return overrides.get(sourceId);
}

export function applySmartSourceOverrides(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...env };
  for (const [sourceId, credentials] of overrides) {
    if (sourceId !== "cerner" && sourceId !== "epic") continue;
    const keys = ENV_KEYS[sourceId];
    merged[keys.clientId] = credentials.clientId;
    merged[keys.issuer] = credentials.issuer;
    if (credentials.clientSecret?.trim()) {
      merged[keys.clientSecret] = credentials.clientSecret.trim();
    }
  }
  return merged;
}

export function envKeysForSmartSource(sourceId: "cerner" | "epic") {
  return ENV_KEYS[sourceId];
}
