import { Caveat } from "next/font/google";

/**
 * Caligrafía manuscrita (OFL) para las frases de búsqueda. `next/font` la
 * descarga al compilar y la sirve desde la app (sin CDN en producción).
 */
export const handwriting = Caveat({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-caveat", display: "swap" });
