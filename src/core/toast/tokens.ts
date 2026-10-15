/**
 * Tokens del notch (toasts y panel de alertas). Es una superficie oscura en
 * ambos temas a propósito: se lee como un aviso de sistema, igual que la isla
 * de un teléfono, y no compite con el contenido de la página.
 *
 * Los colores de estado del toast se repiten en `styles/notch.css`
 * (`--sileo-state-*`) porque Sileo los lee de CSS; si cambias uno, cambia el otro.
 */
export const notchTokens = {
  colors: {
    surface: "#08090b",
    textPrimary: "#f5f5f7",
    textSecondary: "#aeb2bd",
    divider: "#25272c",
    focus: "#83bfff",
    error: "#ff7979",
    warning: "#f3cb6a",
    success: "#64d98b",
    info: "#83bfff",
    loading: "#cbd5e1",
  },
  layout: {
    compactHeight: 40,
    expandedMinHeight: 90,
    freeCornerRadius: 22,
    zIndex: 1600,
  },
  shadow: {
    top: "0 6px 10px rgba(0,0,0,0.18)",
    bottom: "0 -6px 10px rgba(0,0,0,0.18)",
  },
  motion: {
    exitUnmountDelay: 600,
  },
} as const;
