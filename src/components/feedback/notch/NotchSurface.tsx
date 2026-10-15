"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

import { notchTokens as tokens } from "@/core/toast";
import { notchPath, notchSpring } from "./geometry";
import styles from "./NotchSurface.module.css";

export type NotchPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

interface NotchSurfaceProps {
  isOpen: boolean;
  title: string;
  /** Texto para lectores de pantalla cuando cambia el contenido. */
  announcement: string;
  icon: ReactNode;
  /** Color de estado (badge, botones). */
  color?: string;
  children: ReactNode;
  position?: NotchPosition;
  onClose: () => void;
}

type NotchStyle = CSSProperties & Record<`--notch-${string}`, string | number>;

interface Measurements {
  width: number;
  body: number;
}

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Panel modal con forma de notch pegado a un borde. No conoce los datos que
 * muestra: el contenido entra por `children`. Mide su contenido antes de pintar
 * y anima el trazado SVG entre tamaños; con movimiento reducido no anima.
 *
 * Accesibilidad (de Radix Dialog): foco atrapado y devuelto al cerrar, Escape y
 * clic fuera cierran.
 */
export function NotchSurface({
  isOpen,
  title,
  announcement,
  icon,
  color = tokens.colors.error,
  children,
  position = "top-center",
  onClose,
}: NotchSurfaceProps) {
  const reducedMotion = useReducedMotion();
  // `present` mantiene montado el panel durante la animación de salida.
  const [present, setPresent] = useState(isOpen);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Measurements | null>(null);

  const bottom = position.startsWith("bottom");
  const align = position.endsWith("left") ? "left" : position.endsWith("right") ? "right" : "center";
  const closing = !isOpen;

  // Patrón "ajustar estado al cambiar props": abrir monta de inmediato.
  if (isOpen && !present) setPresent(true);

  useEffect(() => {
    if (isOpen) return undefined;
    const timeout = setTimeout(
      () => {
        setPresent(false);
        setSize(null);
      },
      reducedMotion ? 0 : tokens.motion.exitUnmountDelay,
    );
    return () => clearTimeout(timeout);
  }, [isOpen, reducedMotion]);

  useClientLayoutEffect(() => {
    if (!viewport || !body) return undefined;
    const measure = () => {
      const width = viewport.getBoundingClientRect().width;
      if (width <= 0) return;
      const next = { width, body: body.getBoundingClientRect().height };
      setSize((current) =>
        current?.width === next.width && current?.body === next.body ? current : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(body);
    measure();
    return () => observer.disconnect();
  }, [viewport, body]);

  if (!present) return null;

  const height = Math.max(
    tokens.layout.expandedMinHeight,
    tokens.layout.compactHeight + (size?.body ?? 0),
  );
  const variables: NotchStyle = {
    "--notch-surface": tokens.colors.surface,
    "--notch-primary": tokens.colors.textPrimary,
    "--notch-secondary": tokens.colors.textSecondary,
    "--notch-divider": tokens.colors.divider,
    "--notch-focus": tokens.colors.focus,
    "--notch-status": color,
    "--notch-panel-height": `${height}px`,
    "--notch-shadow": bottom ? tokens.shadow.bottom : tokens.shadow.top,
  };

  const requestClose = () => {
    if (!closing) onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && requestClose()}>
      <Dialog.Portal>
        {!closing && <Dialog.Overlay className={styles.overlay} />}
        <Dialog.Content
          ref={setViewport}
          role="alertdialog"
          aria-describedby={undefined}
          className={styles.viewport}
          style={variables}
          data-notch-edge={bottom ? "bottom" : "top"}
          data-notch-align={align}
          data-notch-exiting={closing}
          data-notch-ready={size !== null}
        >
          <div className={styles.frame}>
            {size !== null && (
              <svg className={styles.canvas} width={size.width} height={height} aria-hidden="true">
                <motion.path
                  fill={tokens.colors.surface}
                  initial={false}
                  animate={{ d: notchPath(0, size.width, height, tokens.layout.freeCornerRadius) }}
                  transition={reducedMotion ? { duration: 0 } : notchSpring}
                />
              </svg>
            )}
            <div className={styles.shell}>
              <div className={styles.header}>
                <div className={styles.heading}>
                  <span className={styles.badge}>{icon}</span>
                  <span className={styles.label}>
                    <span className={styles.labelMeasure} aria-hidden="true">
                      {title}
                    </span>
                    <AnimatePresence initial={false}>
                      <motion.span
                        key={title}
                        initial={{ opacity: 0, filter: reducedMotion ? "none" : "blur(6px)" }}
                        animate={{ opacity: 1, filter: reducedMotion ? "none" : "blur(0px)" }}
                        exit={{
                          opacity: 0,
                          filter: reducedMotion ? "none" : "blur(6px)",
                          transition: { duration: reducedMotion ? 0 : 0.42 },
                        }}
                        transition={{ duration: reducedMotion ? 0 : 0.6 }}
                        className={styles.labelLayer}
                        aria-hidden="true"
                      >
                        {title}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <Dialog.Title className="sr-only">{title}</Dialog.Title>
                </div>
                <button
                  type="button"
                  data-notch-close=""
                  className={styles.close}
                  aria-label="Cerrar todas las alertas"
                  disabled={closing}
                  onClick={requestClose}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div
              ref={setBody}
              className={styles.body}
              aria-hidden={closing}
              inert={closing}
            >
              {children}
            </div>
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {announcement}
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
