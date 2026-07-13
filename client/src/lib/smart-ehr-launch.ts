export const SMART_EHR_LAUNCH_GUARD_PREFIX = "smart_ehr_launch:";

export function clearSmartEhrLaunchGuards(): void {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(SMART_EHR_LAUNCH_GUARD_PREFIX)) {
      sessionStorage.removeItem(key);
    }
  }
}

/** Clears non-HttpOnly auth cookies that the browser can remove directly. */
export function clearVisibleAuthCookies(): void {
  document.cookie = "fhir_source=; Max-Age=0; path=/; SameSite=Lax";
}
