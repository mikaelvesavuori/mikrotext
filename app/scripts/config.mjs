const DEFAULT_CONFIG = {
  apiBaseUrl: "http://127.0.0.1:3000",
  debugMode: false,
  maxMessageLength: 1000,
  pollIntervalMs: 2500,
  defaultTtlMs: 60 * 60 * 1000
};

export const CONFIG = { ...DEFAULT_CONFIG };

export async function loadRuntimeConfig(fetcher = fetch) {
  try {
    const response = await fetcher("./config.json", { cache: "no-store" });
    if (!response.ok) return CONFIG;

    Object.assign(CONFIG, normalizeRuntimeConfig(await response.json()));
  } catch {
    Object.assign(CONFIG, DEFAULT_CONFIG);
  }

  return CONFIG;
}

export function normalizeRuntimeConfig(input) {
  if (!input || typeof input !== "object") return { ...DEFAULT_CONFIG };

  const source = input;

  return {
    apiBaseUrl: stringOrDefault(source.apiBaseUrl, DEFAULT_CONFIG.apiBaseUrl),
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

function positiveIntegerOrDefault(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
