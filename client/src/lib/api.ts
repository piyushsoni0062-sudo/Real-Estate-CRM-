import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  details?: unknown;
}

export interface Paginated<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// Same-origin "/api" by default (Path A: frontend + API on one domain via the
// reverse proxy). Set VITE_API_URL at build time to point at a separate backend
// origin (Path B: frontend on shared hosting, backend on Render/Railway).
const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "/api";

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // refresh token travels as an httpOnly cookie
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// ---- Silent refresh on 401, queueing concurrent requests ----
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await axios.post<ApiResponse<{ accessToken: string }>>(
      `${API_BASE}/auth/refresh`,
      {},
      { withCredentials: true }
    );
    accessToken = res.data.data.accessToken;
    return accessToken;
  } catch {
    accessToken = null;
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const url = original?.url ?? "";
    const isAuthCall = url.includes("/auth/login") || url.includes("/auth/refresh");

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      refreshing = refreshing ?? refreshAccessToken();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      onSessionExpired?.();
    }
    return Promise.reject(error);
  }
);

/** Extracts a human-readable message from an API error. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; details?: Array<{ message?: string }> } | undefined;
    if (data?.details?.length && data.details[0]?.message) {
      return `${data.message ?? "Validation failed"}: ${data.details[0].message}`;
    }
    if (data?.message) return data.message;
    if (err.code === "ERR_NETWORK") return "Cannot reach the server. Is the API running?";
  }
  return err instanceof Error ? err.message : "Something went wrong";
}
