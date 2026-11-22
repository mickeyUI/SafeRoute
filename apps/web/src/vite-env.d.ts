interface ImportMetaEnv {
  /** Origin of the FastAPI backend. Empty uses the Vite dev proxy / same origin. */
  readonly VITE_API_BASE_URL?: string;
  /** Demo account used automatically by the web client for protected endpoints. */
  readonly VITE_DEMO_EMAIL?: string;
  readonly VITE_DEMO_PASSWORD?: string;
  readonly VITE_GEOCODING_ENDPOINT?: string;
  readonly VITE_ROUTING_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
