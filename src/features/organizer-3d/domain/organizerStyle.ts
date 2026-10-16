/** Estilo del organizador 3D. Todos muestran los mismos sobres y datos. */
export type OrganizerStyleId = "binder" | "cabinet" | "files";

export interface OrganizerStyleInfo {
  id: OrganizerStyleId;
  label: string;
  /** Qué es, para lectores de pantalla y el título del botón. */
  description: string;
  /** Botón "abrir/cerrar" (en la carpeta abre la tapa; en los demás acerca la cámara). */
  openLabel: string;
  closeLabel: string;
}

export const ORGANIZER_STYLES: readonly OrganizerStyleInfo[] = [
  { id: "binder", label: "Carpeta", description: "Carpeta de cuero con sobres", openLabel: "Abrir carpeta", closeLabel: "Cerrar carpeta" },
  { id: "cabinet", label: "Cajonera", description: "Cajonera de escritorio con cajones translúcidos", openLabel: "Acercar", closeLabel: "Vista general" },
  { id: "files", label: "Archivador", description: "Archivador de acrílico con carpetas verticales", openLabel: "Acercar", closeLabel: "Vista general" },
];

export const DEFAULT_ORGANIZER_STYLE: OrganizerStyleId = "binder";

/** Clave en el navegador (preferencia de quien mira; no son datos del libro). */
/** Clave en el navegador (no se renombra: se perdería el estilo que cada quien eligió). */
export const ORGANIZER_STYLE_STORAGE_KEY = "aurora.organizer-style";

export const isOrganizerStyle = (value: unknown): value is OrganizerStyleId => ORGANIZER_STYLES.some((style) => style.id === value);

/** Lo guardado (o nada) → un estilo válido. */
export const parseOrganizerStyle = (value: unknown): OrganizerStyleId => (isOrganizerStyle(value) ? value : DEFAULT_ORGANIZER_STYLE);

export const styleInfo = (id: OrganizerStyleId): OrganizerStyleInfo => ORGANIZER_STYLES.find((style) => style.id === id) ?? ORGANIZER_STYLES[0];
