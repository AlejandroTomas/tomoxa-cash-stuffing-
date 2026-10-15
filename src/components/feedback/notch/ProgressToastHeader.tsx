/**
 * Encabezado de toast con porcentaje que no hace saltar el ancho del notch:
 * reserva el espacio de "100%" y actualiza el número encima.
 *
 * ```ts
 * showToast({ id: "import", header: <ProgressToastHeader label="Importando" progress={42} />,
 *             description: "Fila 420 de 1000", duration: null });
 * ```
 */
export function ProgressToastHeader({ label = "Cargando", progress }: { label?: string; progress: number }) {
  return (
    <span className="notch-progress-title">
      <span>{label}</span>
      <span className="notch-progress-percentage">
        <span className="notch-progress-measure" aria-hidden="true">
          100%
        </span>
        <span>{progress.toFixed(0)}%</span>
      </span>
    </span>
  );
}
