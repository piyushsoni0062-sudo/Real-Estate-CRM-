/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional backend API base URL (Path B). Defaults to same-origin "/api". */
  readonly VITE_API_URL?: string;
  /** White-label company/app name shown across the UI. Defaults to "Real Estate CRM". */
  readonly VITE_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
