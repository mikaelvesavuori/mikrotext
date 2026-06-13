import { describe, expect, test } from "vitest";

type RuntimeLocation = {
  hostname: string;
  protocol: string;
};

type ConfigModule = {
  normalizeRuntimeConfig: (
    input: unknown,
    runtimeLocation?: RuntimeLocation,
  ) => { apiBaseUrl: string };
};

// @ts-expect-error Browser app modules are plain JavaScript.
const { normalizeRuntimeConfig } = (await import("../../app/scripts/config.mjs")) as ConfigModule;

describe("runtime config", () => {
  test("keeps the local API URL for local development", () => {
    const config = normalizeRuntimeConfig(
      { apiBaseUrl: "http://127.0.0.1:3000" },
      { protocol: "http:", hostname: "127.0.0.1" },
    );

    expect(config.apiBaseUrl).toBe("http://127.0.0.1:3000");
  });

  test("does not use a loopback API URL from a hosted HTTPS app", () => {
    const config = normalizeRuntimeConfig(
      { apiBaseUrl: "http://127.0.0.1:3000" },
      { protocol: "https:", hostname: "text.mikrosuite.com" },
    );

    expect(config.apiBaseUrl).toBe("https://text-api.mikrosuite.com");
  });

  test("preserves an explicit hosted API URL", () => {
    const config = normalizeRuntimeConfig(
      { apiBaseUrl: "https://custom-text-api.example.com" },
      { protocol: "https:", hostname: "text.example.com" },
    );

    expect(config.apiBaseUrl).toBe("https://custom-text-api.example.com");
  });
});
