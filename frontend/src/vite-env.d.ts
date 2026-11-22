interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GEOCODING_ENDPOINT?: string;
  readonly VITE_ROUTING_ENDPOINT?: string;
  readonly VITE_PUBLIC_APP_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
