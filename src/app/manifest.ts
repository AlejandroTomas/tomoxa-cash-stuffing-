import type { MetadataRoute } from "next";
import { publicEnv } from "@/core/env";

/** Para instalar la app: nombre, colores e íconos (generados desde `app/icon.svg`). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: publicEnv.NEXT_PUBLIC_APP_NAME,
    short_name: "Ahorroxa",
    description: "Tus sobres de dinero en un organizador 3D: carpeta, cajonera o archivador.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6ede8",
    theme_color: "#de5f6a",
    icons: [
      { src: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
