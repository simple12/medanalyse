export function formatSmartLaunchError(message: string): string {
  const normalized = message.trim().toLowerCase();

  if (
    normalized.includes("mismatched-identity") ||
    normalized.includes("grant:launch:mismatched-identity")
  ) {
    return [
      "Cerner rejected the sign-in: mismatched identity.",
      "The patient selected in Code Console does not match the portal account you used to log in.",
      "Wilma: pick Wilma Smart in Test Sandbox, then sign in as wilma_smart / Cerner01.",
      "Timmy: pick Timmy Smart in Test Sandbox, then sign in as timmy_smart / Cerner01, or as nancy_smart / Cerner01 and choose Timmy if prompted.",
      "Start again from Code Console → Test Sandbox for each attempt.",
    ].join(" ");
  }

  if (normalized.includes("invalid_client") || normalized.includes("unauthorized_client")) {
    return [
      "Epic rejected the client credentials (invalid_client).",
      "Use the Non-Production Client ID from fhir.epic.com (not Production).",
      "Register redirect URI exactly: https://fhir-patient-app-five.vercel.app/api/auth/smart/callback",
      "For public sandbox apps, leave the client secret blank and use PKCE (this app does that automatically).",
    ].join(" ");
  }

  if (normalized.includes("invalid_scope")) {
    return [
      "Epic rejected the requested scopes (invalid_scope).",
      "Ensure your app at fhir.epic.com includes patient read scopes such as Patient.read, Observation.read, Condition.read, and MedicationRequest.read.",
      "Standalone launch requires launch/patient; EHR launch requires launch.",
    ].join(" ");
  }

  if (normalized === "invalid_request" || normalized.includes("invalid launch")) {
    return [
      "Cerner rejected the launch request (invalid_request).",
      "Launch tokens are single-use — always start fresh from Code Console → Test Sandbox.",
      "For Wilma Smart: pick Wilma, then sign in as wilma_smart / Cerner01.",
      "For Timmy Smart: pick Timmy, then sign in as timmy_smart / Cerner01, or nancy_smart / Cerner01 (proxy).",
    ].join(" ");
  }

  if (normalized.startsWith("https://authorization.cerner.com/errors/")) {
    const slug = normalized.split("/errors/")[1]?.split("/")[0] ?? "";
    if (slug.includes("mismatched-identity")) {
      return formatSmartLaunchError("mismatched-identity");
    }
    if (slug.includes("invalid-launch-code")) {
      return formatSmartLaunchError("invalid launch");
    }
  }

  return message;
}
