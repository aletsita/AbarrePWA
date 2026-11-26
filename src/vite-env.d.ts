interface ImportMetaEnv {
  // Dirección de AbarreAPI (https://api.midominio.com). Si falta, la API está en el mismo origen:
  // en desarrollo Vite reenvía /api, /hubs, /archivos y /__sync a API_PROXY_TARGET (http://localhost:8787).
  readonly VITE_API_URL?: string;
}
