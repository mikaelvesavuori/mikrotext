import { CONFIG } from "./config.mjs";

export async function apiRequest(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(createApiUrl(endpoint), {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof data === "object" && data?.error ? data.error : response.statusText;
    throw new Error(message);
  }

  return data;
}

function createApiUrl(endpoint) {
  const baseUrl = CONFIG.apiBaseUrl.replace(/\/+$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  return baseUrl === "." ? `.${path}` : `${baseUrl}${path}`;
}
