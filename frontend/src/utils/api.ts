/**
 * API utilities
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const API_KEY = import.meta.env.VITE_API_KEY ?? "";

/**
 * Get default headers for API requests (includes API Key for all endpoints)
 */
export function getApiHeaders(
  contentType = "application/json"
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
  };

  if (API_KEY) {
    headers["x-api-key"] = API_KEY;
  } else {
    console.warn(
      "⚠️ VITE_API_KEY is not set. API requests will be rejected with 401."
    );
  }

  return headers;
}

export { API_BASE_URL };
