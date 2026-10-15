import LoaderSticks from "@/components/feedback/LoaderSticks";

/** Mientras carga una ruta (Suspense de Next). Cada segmento puede tener el suyo. */
export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Cargando">
      <LoaderSticks size={40} />
    </div>
  );
}
