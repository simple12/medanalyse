export interface SmartSourceEnvInput {
  clientId: string;
  clientSecret?: string;
  issuer: string;
}

export interface ConfigureSmartSourceResult {
  mode: "local" | "vercel";
  deploymentId?: string;
  deploymentUrl?: string;
  readyState?: string;
}

function vercelApiBase(): string {
  return "https://api.vercel.com";
}

function authHeaders(token: string, teamId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (teamId?.trim()) {
    headers["x-vercel-team-id"] = teamId.trim();
  }
  return headers;
}

async function vercelJson<T>(
  token: string,
  path: string,
  init?: RequestInit,
  teamId?: string,
): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const teamSuffix = teamId?.trim() ? `${separator}teamId=${encodeURIComponent(teamId.trim())}` : "";
  const response = await fetch(`${vercelApiBase()}${path}${teamSuffix}`, {
    ...init,
    headers: {
      ...authHeaders(token, teamId),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vercel API ${response.status}: ${body || response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function upsertProjectEnvVars(
  token: string,
  projectId: string,
  entries: Array<{ key: string; value: string; sensitive?: boolean }>,
  teamId?: string,
): Promise<void> {
  for (const entry of entries) {
    await vercelJson(
      token,
      `/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true`,
      {
        method: "POST",
        body: JSON.stringify({
          key: entry.key,
          value: entry.value,
          type: entry.sensitive ? "sensitive" : "plain",
          target: ["production", "preview", "development"],
        }),
      },
      teamId,
    );
  }
}

export async function deleteProjectEnvVar(
  token: string,
  projectId: string,
  key: string,
  teamId?: string,
): Promise<void> {
  const envs = await vercelJson<{ envs: Array<{ id: string; key: string }> }>(
    token,
    `/v10/projects/${encodeURIComponent(projectId)}/env`,
    undefined,
    teamId,
  );
  const match = envs.envs?.find((entry) => entry.key === key);
  if (!match) return;
  await vercelJson(
    token,
    `/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(match.id)}`,
    { method: "DELETE" },
    teamId,
  );
}

async function resolveProjectName(
  token: string,
  projectId: string,
  teamId?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const configured = env.VERCEL_PROJECT_NAME?.trim();
  if (configured) return configured;

  const project = await vercelJson<{ name: string }>(
    token,
    `/v9/projects/${encodeURIComponent(projectId)}`,
    undefined,
    teamId,
  );
  if (!project.name?.trim()) {
    throw new Error("Could not resolve Vercel project name for redeploy");
  }
  return project.name.trim();
}

export async function triggerProductionRedeploy(
  token: string,
  projectId: string,
  projectName: string,
  deploymentId?: string,
  teamId?: string,
): Promise<{ id: string; url?: string; readyState?: string }> {
  const body: Record<string, string> = { name: projectName };
  if (deploymentId?.trim()) {
    body.deploymentId = deploymentId.trim();
  } else {
    body.target = "production";
  }

  const result = await vercelJson<{
    id: string;
    url?: string;
    readyState?: string;
  }>(
    token,
    `/v13/deployments`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    teamId,
  );

  return result;
}

export async function getDeploymentStatus(
  token: string,
  deploymentId: string,
  teamId?: string,
): Promise<{ id: string; readyState: string; url?: string }> {
  const result = await vercelJson<{
    id: string;
    readyState: string;
    url?: string;
  }>(token, `/v13/deployments/${encodeURIComponent(deploymentId)}`, undefined, teamId);
  return result;
}

export function canConfigureViaVercel(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VERCEL_TOKEN?.trim() && env.VERCEL_PROJECT_ID?.trim());
}

export async function configureSmartSourceOnVercel(
  sourceId: "cerner" | "epic",
  credentials: SmartSourceEnvInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ConfigureSmartSourceResult> {
  const token = env.VERCEL_TOKEN?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  const teamId = env.VERCEL_TEAM_ID?.trim();
  const deploymentId = env.VERCEL_DEPLOYMENT_ID?.trim();

  if (!token || !projectId) {
    throw new Error(
      "Vercel automation is not configured. Set VERCEL_TOKEN and VERCEL_PROJECT_ID on the deployment.",
    );
  }

  const prefix = sourceId === "cerner" ? "CERNER" : "EPIC";
  const entries: Array<{ key: string; value: string; sensitive?: boolean }> = [
    { key: `${prefix}_CLIENT_ID`, value: credentials.clientId },
    { key: `${prefix}_ISSUER`, value: credentials.issuer },
  ];
  if (credentials.clientSecret?.trim()) {
    entries.push({
      key: `${prefix}_CLIENT_SECRET`,
      value: credentials.clientSecret.trim(),
      sensitive: true,
    });
  } else if (sourceId === "cerner") {
    await deleteProjectEnvVar(token, projectId, `${prefix}_CLIENT_SECRET`, teamId);
  }
  await upsertProjectEnvVars(token, projectId, entries, teamId);

  const projectName = await resolveProjectName(token, projectId, teamId, env);
  const deployment = await triggerProductionRedeploy(
    token,
    projectId,
    projectName,
    deploymentId,
    teamId,
  );
  return {
    mode: "vercel",
    deploymentId: deployment.id,
    deploymentUrl: deployment.url,
    readyState: deployment.readyState,
  };
}
