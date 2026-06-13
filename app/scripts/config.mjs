const LOCAL_API_BASE_URL = "http://127.0.0.1:3000";
const HOSTED_API_BASE_URL = "https://text-api.mikrosuite.com";

const DEFAULT_CONFIG = {
  apiBaseUrl: LOCAL_API_BASE_URL,
  debugMode: false,
  maxMessageLength: 1000,
  pollIntervalMs: 2500,
  defaultTtlMs: 60 * 60 * 1000
};

export const CONFIG = { ...DEFAULT_CONFIG };

export async function loadRuntimeConfig(fetcher = fetch, runtimeLocation = getRuntimeLocation()) {
  try {
    const response = await fetcher("./config.json", { cache: "no-store" });
    if (!response.ok) {
      Object.assign(CONFIG, normalizeRuntimeConfig(DEFAULT_CONFIG, runtimeLocation));
      return CONFIG;
    }

    Object.assign(CONFIG, normalizeRuntimeConfig(await response.json(), runtimeLocation));
  } catch {
    Object.assign(CONFIG, normalizeRuntimeConfig(DEFAULT_CONFIG, runtimeLocation));
  }

  return CONFIG;
}

export function normalizeRuntimeConfig(input, runtimeLocation = getRuntimeLocation()) {
  if (!input || typeof input !== "object")
    return {
      ...DEFAULT_CONFIG,
      apiBaseUrl: resolveApiBaseUrl(DEFAULT_CONFIG.apiBaseUrl, runtimeLocation)
    };

  const source = input;

  return {
    apiBaseUrl: resolveApiBaseUrl(source.apiBaseUrl, runtimeLocation),
    debugMode: source.debugMode === true,
    maxMessageLength: positiveIntegerOrDefault(
      source.maxMessageLength,
      DEFAULT_CONFIG.maxMessageLength
    ),
    pollIntervalMs: positiveIntegerOrDefault(source.pollIntervalMs, DEFAULT_CONFIG.pollIntervalMs),
    defaultTtlMs: positiveIntegerOrDefault(source.defaultTtlMs, DEFAULT_CONFIG.defaultTtlMs)
  };
}

function stringOrDefault(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function resolveApiBaseUrl(value, runtimeLocation) {
  const apiBaseUrl = stringOrDefault(value, DEFAULT_CONFIG.apiBaseUrl);
  return isHostedRuntime(runtimeLocation) && isLoopbackUrl(apiBaseUrl)
    ? HOSTED_API_BASE_URL
    : apiBaseUrl;
}

function positiveIntegerOrDefault(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function getRuntimeLocation() {
  return typeof window === "object" ? window.location : undefined;
}

function isHostedRuntime(runtimeLocation) {
  return (
    runtimeLocation?.protocol === "https:" && !isLoopbackHostname(runtimeLocation.hostname || "")
  );
}

function isLoopbackUrl(value) {
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

function isLoopbackHostname(hostname) {
  return ["127.0.0.1", "localhost", "0.0.0.0", "[::1]"].includes(hostname);
}
