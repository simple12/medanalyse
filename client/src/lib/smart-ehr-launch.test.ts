import { afterEach, describe, expect, it } from "vitest";
import {
  SMART_EHR_LAUNCH_GUARD_PREFIX,
  clearSmartEhrLaunchGuards,
} from "./smart-ehr-launch";

describe("clearSmartEhrLaunchGuards", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("removes only SMART EHR launch guard keys", () => {
    sessionStorage.setItem(`${SMART_EHR_LAUNCH_GUARD_PREFIX}abc`, "1");
    sessionStorage.setItem(`${SMART_EHR_LAUNCH_GUARD_PREFIX}xyz`, "1");
    sessionStorage.setItem("other_key", "keep");

    clearSmartEhrLaunchGuards();

    expect(sessionStorage.getItem(`${SMART_EHR_LAUNCH_GUARD_PREFIX}abc`)).toBeNull();
    expect(sessionStorage.getItem(`${SMART_EHR_LAUNCH_GUARD_PREFIX}xyz`)).toBeNull();
    expect(sessionStorage.getItem("other_key")).toBe("keep");
  });
});
