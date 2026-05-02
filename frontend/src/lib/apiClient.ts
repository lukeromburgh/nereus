import axios, { AxiosHeaders } from "axios";
import type { InternalAxiosRequestConfig } from "axios";

const configuredBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const CSRF_COOKIE_NAME = "csrftoken";
const UNSAFE_METHODS = new Set(["post", "put", "patch", "delete"]);

let csrfBootstrapPromise: Promise<string | null> | null = null;

export const API_BASE_URL = configuredBaseUrl
  ? configuredBaseUrl.replace(/\/+$/, "")
  : "";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const target = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(target));

  if (!cookie) return null;
  return decodeURIComponent(cookie.slice(target.length));
}

export function toApiUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getCsrfToken(): string | null {
  return readCookie(CSRF_COOKIE_NAME);
}

const apiClient = axios.create({
  baseURL: API_BASE_URL || undefined,
  withCredentials: true,
});

export async function ensureCsrfCookie(force = false): Promise<string | null> {
  const existingToken = force ? null : getCsrfToken();
  if (existingToken) return existingToken;

  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = apiClient
      .get("/api/auth/csrf/")
      .then(() => getCsrfToken())
      .finally(() => {
        csrfBootstrapPromise = null;
      });
  }

  return csrfBootstrapPromise;
}

function applyCsrfHeader(config: InternalAxiosRequestConfig, token: string) {
  const headers = AxiosHeaders.from(config.headers ?? {});
  headers.set("X-CSRFToken", token);
  config.headers = headers;
}

apiClient.interceptors.request.use(async (config) => {
  const method = (config.method ?? "get").toLowerCase();
  if (!UNSAFE_METHODS.has(method)) return config;

  const csrfToken = await ensureCsrfCookie();
  if (csrfToken) {
    applyCsrfHeader(config, csrfToken);
  }

  return config;
});

export { isAxiosError } from "axios";
export default apiClient;
