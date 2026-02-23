/**
 * Presigned URL API hook for lesson PDF uploads
 */

import { API_BASE_URL, getApiHeaders } from "../utils/api";

const UPLOAD_API = `${API_BASE_URL}/lesson-upload-url`;

export interface PresignedUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

/**
 * Request a presigned S3 upload URL from the API
 * @param lessonId - Lesson ID (e.g., "3" or "03")
 * @param password - Upload password (required)
 * @param level - Course level (default: "a1")
 * @returns Promise with uploadUrl, key, and expiry time
 */
export async function getPresignedUrl(
  lessonId: string,
  password: string,
  level: string = "a1"
): Promise<PresignedUrlResponse> {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured.");
  }

  if (!password) {
    throw new Error("Password is required to generate upload URL.");
  }

  const response = await fetch(UPLOAD_API, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify({
      lessonId: lessonId.trim(),
      level: level.trim(),
      password: password.trim(),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json() as Promise<PresignedUrlResponse>;
}
