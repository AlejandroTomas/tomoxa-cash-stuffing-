import type { EnvelopeDocument } from "../domain/document";
import type { EnvelopeId, EnvelopeItem } from "../domain/envelopeView";
import type { SwipeDirection } from "../domain/gestures";

/**
 * Contrato común de las escenas del organizador (carpeta, cajonera, archivador).
 * El controlador y la interfaz solo conocen esto; cada estilo lo implementa con
 * sus propias animaciones. Tocar un sobre lo saca y lo abre en una sola
 * animación (`openEnvelope`); `closeEnvelope` lo regresa a su lugar.
 */

/** Lo que el usuario tocó en el lienzo; React decide qué acción corresponde. */
export type SceneIntent =
  | { type: "binder" }
  | { type: "envelope"; id: EnvelopeId }
  | { type: "document"; id: string }
  /** Deslizamiento (dedo o mouse); `envelope`/`document`: dónde empezó. */
  | { type: "swipe"; direction: SwipeDirection; envelope?: EnvelopeId; document?: string };

/** Márgenes (px) del lienzo que tapa la interfaz: la carpeta se encuadra en el resto. */
export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface OrganizerSceneApi {
  open: () => Promise<void>;
  close: () => Promise<void>;
  /**
   * Saca el sobre de su lugar y lo abre con sus documentos (solo lectura), en
   * una sola animación. Con el organizador abierto y ningún sobre fuera.
   * `visibleIds` = los que pasan el filtro, en orden.
   */
  openEnvelope: (id: EnvelopeId, documents: readonly EnvelopeDocument[], visibleIds: readonly string[], caption: string) => Promise<void>;
  /** Guarda los documentos y regresa el sobre a su lugar. */
  closeEnvelope: () => Promise<void>;
  /** Reacomoda el abanico al cambiar el filtro (el último llamado gana). */
  showDocuments: (visibleIds: readonly string[], caption: string) => void;
  pickDocument: (id: string) => Promise<void>;
  returnDocument: () => Promise<void>;
  /**
   * Fichas de dinero viajan de un sobre a otro (solo animación; los montos los
   * cambia la interfaz). `null` = fuera de la carpeta (ingreso o gasto). Con la carpeta abierta.
   */
  transfer: (from: EnvelopeId | null, to: EnvelopeId | null) => Promise<void>;
  /** Aplica nombre, color e icono a un sobre (vista previa en vivo y guardado). */
  restyleEnvelope: (item: EnvelopeItem) => void;
  /**
   * Sobres de la carpeta, en orden. Si solo cambió su estilo, se reestilizan; si
   * cambió qué sobres hay, la carpeta se reacomoda (con un sobre fuera, espera a que regrese).
   */
  setEnvelopes: (items: readonly EnvelopeItem[]) => Promise<void>;
  setSafeArea: (area: SafeArea) => void;
  onIntent: (callback: ((intent: SceneIntent) => void) | null) => void;
  dispose: () => void;
}
