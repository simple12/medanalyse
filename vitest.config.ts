// Runs the backend `shared/` unit tests (the client has its own vitest config).
// Plain object so it can be loaded by the client's vitest binary without a
// root-level vitest install.
export default {
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts"],
  },
};
