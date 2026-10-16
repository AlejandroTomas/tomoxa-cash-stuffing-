<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Ahorroxa — archivo de inicio

Organizador de sobres de dinero (cash stuffing) en 3D. Lo que no se negocia es
la arquitectura por capas y el sistema de diseño.

Stack: Next 16 (App Router) · React 19 · TypeScript estricto · Tailwind v4 +
shadcn/ui (Radix) · Redux Toolkit · Zod · Jest · pnpm · Three.js + GSAP · Dexie.

```bash
pnpm install
cp .env.example .env.local   # ajusta los valores (validados en src/core/env/schema.ts)
pnpm dev                     # http://localhost:3000
pnpm verify                  # tipos + lint + tests. Antes de cada commit.
pnpm build                   # además detecta lo que tsc no (p. ej. server-only en el cliente)
```

## 1. Qué hay

| Módulo | Para qué |
|---|---|
| **Organizador 3D** (`/`, `features/organizer-3d`) | Página de inicio: carpeta, cajonera o archivador con sobres que se abren con un toque, documentos en 3D y fichas de dinero (Three.js + GSAP) e interfaz de vidrio. `/organizer` redirige a `/`. Guía: su `README.md` |
| **Libro** (`features/ledger`) | Cuentas, sobres, movimientos, tarjeta, presupuestos y respaldo. Todo en IndexedDB (Dexie); no hay servidor. Guía: su `README.md` |
| **API propia** (`app/api/health`) | Solo el chequeo de salud, con `route()/ok()` de `core/http/server` |
| **Marca** | `src/app/icon.svg` (favicon e íconos de la app, de ahí salen los PNG y el `.ico` de `public/`), `AhorroxaMark` en la barra, `app/manifest.ts`, `NEXT_PUBLIC_APP_NAME` |

Nombres internos que **no se renombran** aunque digan "aurora": la base
`aurora-ledger`, el formato del respaldo y la clave `aurora.organizer-style`;
cambiarlos dejaría atrás los datos y preferencias ya guardados.

**Agregar:**
- Variables de entorno → `src/core/env/schema.ts` (públicas con `NEXT_PUBLIC_`, nunca secretos).
- Destino de errores (Sentry, etc.) → `registerErrorSink()` de `core/logger`, en el arranque.
- Títulos de módulo en las alertas de error → `MODULE_TITLES` en `src/store/index.ts`.
- Formularios → `react-hook-form` + `@hookform/resolvers/zod` (ya instalados).
- Primitivas de UI → `pnpm dlx shadcn@latest add <componente>` (nunca otra librería de UI).
- Un feature nuevo → copia la forma de `features/ledger` (repositories → services → actions → slice/selector).

## 2. Arquitectura (obligatoria)

Documento completo: **`.ia/context/arquitectura-en-capas.md`** — léelo antes de
crear un módulo.

```
src/app/          rutas delgadas · app/api/** = backend (Route Handlers)
src/features/<x>/ un dominio: repositories → services → actions → slice/selector · domain · errors · components
src/components/   UI sin dominio (ui/ = shadcn)
src/core/         infraestructura: errors, logger, env, http (servidor), toast, alert
src/store/        Redux: loadingSlice, wrapper de thunks, middleware de errores
```

```
componente → thunk → service → repository → IndexedDB (Dexie)   [o core/http → app/api/** si algún día hay servidor]
```

Lo esencial (ESLint hace cumplir lo marcado con *):

- *El componente no toca datos (`core/http`, `fetch`): eso va en un `repositories/`.
- *Un feature no importa `repositories/` ni `actions/` de otro; `core/` no importa nada de arriba; `components/` no conoce features.
- Las reglas de negocio van en `services/` y fallan con errores tipados (`core/errors`).
- Todo thunk con `createAsyncThunkWithErrorHandling`, `typePrefix` único (`"orders/fetch"`).
- Loading con `selectIsLoading(thunk)`, no en el slice. Los errores de thunks se muestran solos.
- *Sin `console.log` (usa `reportError`) y *sin `any`.
- `AppError.message` es lo único que ve el usuario; el detalle técnico va en `debugMessage`.

Crear un feature: sigue la forma de `src/features/ledger`.

## 3. Sistema de diseño (obligatorio)

Especificación: **`.ia/context/sistema-diseno.md`**. En corto:

- **Siempre** las primitivas de `src/components/ui` (shadcn new-york + Radix). No se
  agrega otra librería de componentes.
- Colores **por token** (`bg-card`, `text-muted-foreground`, `border-border`),
  nunca fijos (`bg-white`, `text-gray-500`): el tema oscuro es por clase y se rompen.
- Radios de la escala (`rounded-lg`…), nunca arbitrarios. `tabular-nums` en números.
- Antes de crear un componente, revisa la tabla "Piezas ya construidas" del
  documento y `src/components`.

## 4. Mapa de piezas reutilizables

| Necesitas | Está en | Guía |
|---|---|---|
| Errores tipados y mensaje seguro | `core/errors` | — |
| Reportar errores | `core/logger` (`reportError`, `registerErrorSink`) | — |
| Responder desde `app/api` | `core/http/server` (`route`, `ok`, `parseJson`) | `app/api/health` |
| Variables de entorno | `core/env` (`publicEnv`; `serverEnv` en `core/env/server`) | `.env.example` |
| Toasts y alertas notch | `core/toast`, `core/alert` | `core/toast/README.md` |
| Thunks y estado de carga | `store/utils`, `store/loadingSelectors` | `features/ledger` |
| Guardar en el dispositivo | Dexie (`features/ledger/repositories`) | `features/ledger/README.md` |

## 5. Convenciones

- Textos de UI, comentarios y documentación **en español**; código (nombres) en inglés.
- Alias `@/` para imports entre carpetas; rutas relativas dentro de un mismo feature.
- Si el archivo no tiene JSX, es `.ts`. Una carpeta se crea cuando hay algo real que meterle.
- Specs de tareas grandes en `.ia/tasks/`; reglas que se aprendan, a `.ia/context/`.
- Antes de un PR: checklist al final de `.ia/context/arquitectura-en-capas.md`.
