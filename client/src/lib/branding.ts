/**
 * App / company name shown across the UI (sidebar, login, browser tab, PWA).
 * Set per client at build time with VITE_APP_NAME — each white-label instance
 * gets its own name without any code change. Falls back to a generic default.
 */
export const APP_NAME = (import.meta.env.VITE_APP_NAME || "").trim() || "Real Estate CRM";
