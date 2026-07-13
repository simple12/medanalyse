import { describe, expect, it } from "vitest";
import { formatSmartLaunchError } from "./cerner-launch-errors";

describe("formatSmartLaunchError", () => {
  it("explains mismatched-identity from Cerner error URLs", () => {
    const message = formatSmartLaunchError(
      "https://authorization.cerner.com/errors/urn:cerner:error:authorization-server:smart-v1:grant:launch:mismatched-identity/instances/abc",
    );
    expect(message).toContain("mismatched identity");
    expect(message).toContain("wilma_smart");
    expect(message).toContain("timmy_smart");
  });
});
