/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional backend API base URL (Path B). Defaults to same-origin "/api". */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
