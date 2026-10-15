# Toasts y alertas notch

Dos canales, cada uno para una cosa:

| | Toast (`@/core/toast`) | Alerta (`@/core/alert`) |
|---|---|---|
| Para | Avisos breves: guardado, copiado, progreso | Lo que hay que leer y cerrar: errores, resultados de un lote |
| Se cierra | Solo (3 s por defecto) | Solo el usuario |
| Repetidos | El nuevo reemplaza al visible | Se agrupan con ×N |
| Montaje | `<NotchToaster />` | `<GlobalAlerts />` |

Los dos ya están montados en `src/providers/Providers.tsx`. Los errores de
thunks llegan al panel de alertas solos (`store/index.ts`); no los repitas
desde el componente.

```ts
import { toast, showToast } from "@/core/toast";
import { alertService } from "@/core/alert";

toast.success("Los cambios se guardaron.");
showToast({ title: "Pedido archivado", description: "…", action: { label: "Deshacer", onClick } });
await toast.promise(save(), { loading: "Guardando…", success: "Listo", error: toSafeMessage });

alertService.reportError("Pedidos", error);            // error desconocido: mensaje seguro
alertService.reportErrors("Importación", rowErrors);   // lote: repetidos ×N
alertService.warning("Inventario", "Quedan 3 piezas."); // mensaje propio
```

Ejemplos vivos en `/showcase`.

## Archivos

- `core/toast/tokens.ts`: colores y medidas del notch. Es oscuro en ambos
  temas a propósito.
- `styles/notch.css`: estilos del toast (Sileo los lee de CSS). Sus colores de
  estado repiten los de `tokens.ts`.
- `components/feedback/notch/`: `NotchSurface` (el panel, sobre Radix Dialog),
  `AlertCollection`, `GlobalAlerts`, `NotchToaster`, `ProgressToastHeader`.

## El parche de Sileo

La forma `shape="notch"`, el trazado Bézier, el `id` para actualizar un toast
en sitio y el `header` propio NO vienen en Sileo: los agrega
`patches/sileo@0.1.6.patch`, que pnpm aplica en cada `pnpm install`
(`patchedDependencies` en `pnpm-workspace.yaml`). Por eso la versión está
fijada en `0.1.6` sin `^`.

Para modificar el parche:

```bash
pnpm patch sileo@0.1.6          # abre una copia editable y dice dónde
# edita dist/notch.mjs, dist/notch.js, dist/index.mjs, dist/index.js
pnpm patch-commit <carpeta>     # regenera patches/sileo@0.1.6.patch
```

Al subir de versión Sileo, revisa que el parche siga aplicando; si no, hay que
rehacerlo sobre la versión nueva. Reinicia `pnpm dev` después de cambiar el
parche para que Next no use la copia en caché.
