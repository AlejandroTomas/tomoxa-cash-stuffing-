<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Plantilla Aurora — archivo de inicio

Esta plantilla es **punto de partida, no producto**: casi todo es de apoyo. En
cada proyecto nuevo se **borra lo que no se use y se agrega lo que falte**. Lo
que no se negocia es la arquitectura por capas y el sistema de diseño.

Stack: Next 16 (App Router) · React 19 · TypeScript estricto · Tailwind v4 +
shadcn/ui (Radix) · Redux Toolkit · Zod · Jest · pnpm.

```bash
pnpm install
cp .env.example .env.local   # ajusta los valores (validados en src/core/env/schema.ts)
pnpm dev                     # http://localhost:3000 → bienvenida, /showcase, /example
pnpm verify                  # tipos + lint + tests. Antes de cada commit.
pnpm build                   # además detecta lo que tsc no (p. ej. server-only en el cliente)
```

## 1. Primer paso en un proyecto nuevo

Recorre esta lista **antes de escribir código** y decide qué se queda. Cada
módulo se puede quitar sin romper el resto (después de quitar: `pnpm verify && pnpm build`).

| Módulo | Para qué | Si NO lo necesitas |
|---|---|---|
| **Showcase** (`/showcase`) | Ejemplos vivos de todo lo que trae la plantilla | Borra `src/app/showcase`, `src/app/api/showcase` y su ítem en `components/layouts/AdminLayout.tsx` |
| **Feature de ejemplo** (`/example`) | Módulo de referencia con todas las capas | Cópialo para tu primer feature y luego bórralo: ver `src/features/_example/README.md` |
| **Login de ejemplo** (`/login`, `features/auth`) | Flujo completo: react-hook-form + Zod → thunk → service → `core/session` | **El endpoint `app/api/auth/login` es de demostración** (acepta la contraseña `demo`): reemplázalo por tu autenticación real o borra `features/auth` y la ruta |
| **Dashboard** (`/dashboard`) | Layout con menú lateral, `StatTile` y la sesión | Reemplázalo por el tablero del proyecto o bórralo junto con su ítem en `AdminLayout` |
| **Aurora Organizer** (`/`, `features/organizer-3d`) | Página de inicio: organizador 3D (carpeta, cajonera o archivador) con sobres extraíbles (Three.js + GSAP) e interfaz de vidrio; los datos vienen de `features/ledger` (en el dispositivo). `/organizer` redirige a `/` | Borra `src/features/organizer-3d`, `src/app/organizer`, `public/assets/organizer`, pon otra `src/app/page.tsx` y `pnpm remove three gsap @types/three` |
| **Outbox** (`core/sync`) | Guardar sin conexión y subir después | Viene **apagado**. Para quitarlo del todo: `src/core/sync/README.md` → "¿Lo necesito?" |
| **Importar Excel** | Modal de carga con mapeo de columnas | Borra `components/import` y `pnpm remove xlsx` |
| **Tabla paginada + filtros** | Listados con búsqueda, filtros, orden | Borra `components/compound/PaginatedTable` y `components/filters` |
| **AsyncSelect** | Búsqueda remota en un select | Borra `components/form/AsyncSelect.tsx`, su reducer en `store/reducers.ts` y `pnpm remove async-selector-kit` |
| **Sesión en el cliente** (`core/session`) | Token y datos del usuario en `localStorage` | Si tu backend usa cookie `httpOnly` (recomendado), deja `token` vacío y guarda solo el perfil |
| **API propia** (`app/api/**`) | Route Handlers con `route()/ok()/parseJson()` | Si consumes una API externa, usa `createHttpClient({ baseURL, trustServerMessages: false })` |

**Agregar:**
- Variables de entorno → `src/core/env/schema.ts` (públicas con `NEXT_PUBLIC_`, nunca secretos).
- Destino de errores (Sentry, etc.) → `registerErrorSink()` de `core/logger`, en el arranque.
- Títulos de módulo en las alertas de error → `MODULE_TITLES` en `src/store/index.ts`.
- Formularios → `react-hook-form` + `@hookform/resolvers/zod` (ya instalados).
- Primitivas de UI → `pnpm dlx shadcn@latest add <componente>` (nunca otra librería de UI).
- Nombre y marca → `NEXT_PUBLIC_APP_NAME`, `brand` en `AdminLayout`, tokens de color en `globals.css`.
- Proteger rutas → `src/proxy.ts` (en Next 16 reemplaza a `middleware.ts`; ver
  `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`) leyendo una
  cookie `httpOnly` de sesión, **solo como chequeo optimista** (redirigir al login).
  La autorización real se valida en cada Route Handler. El `localStorage` de
  `core/session` no llega al servidor.

## 2. Arquitectura (obligatoria)

Documento completo: **`.ia/context/arquitectura-en-capas.md`** — léelo antes de
crear un módulo.

```
src/app/          rutas delgadas · app/api/** = backend (Route Handlers)
src/features/<x>/ un dominio: repositories → services → actions → slice/selector · domain · errors · components
src/components/   UI sin dominio (ui/ = shadcn)
src/core/         infraestructura: errors, logger, env, http, session, toast, alert, sync
src/store/        Redux: loadingSlice, wrapper de thunks, middleware de errores
```

```
componente → thunk → service → repository → core/http → app/api/** → base de datos
```

Lo esencial (ESLint hace cumplir lo marcado con *):

- *El componente no toca datos (`core/http`, `fetch`): eso va en un `repositories/`.
- *Un feature no importa `repositories/` ni `actions/` de otro; `core/` no importa nada de arriba; `components/` no conoce features.
- Las reglas de negocio van en `services/` y fallan con errores tipados (`core/errors`).
- Todo thunk con `createAsyncThunkWithErrorHandling`, `typePrefix` único (`"orders/fetch"`).
- Loading con `selectIsLoading(thunk)`, no en el slice. Los errores de thunks se muestran solos.
- *Sin `console.log` (usa `reportError`) y *sin `any`.
- `AppError.message` es lo único que ve el usuario; el detalle técnico va en `debugMessage`.

Crear un feature: copia `src/features/_example` (instrucciones en su README).

## 3. Sistema de diseño (obligatorio)

Especificación: **`.ia/context/sistema-diseno.md`**. En corto:

- **Siempre** las primitivas de `src/components/ui` (shadcn new-york + Radix). No se
  agrega otra librería de componentes.
- Colores **por token** (`bg-card`, `text-muted-foreground`, `border-border`),
  nunca fijos (`bg-white`, `text-gray-500`): el tema oscuro es por clase y se rompen.
- Radios de la escala (`rounded-lg`…), nunca arbitrarios. `tabular-nums` en números.
- Antes de crear un componente, revisa la tabla "Piezas ya construidas" del
  documento y `/showcase`.

## 4. Mapa de piezas reutilizables

| Necesitas | Está en | Guía |
|---|---|---|
| Errores tipados y mensaje seguro | `core/errors` | — |
| Reportar errores | `core/logger` (`reportError`, `registerErrorSink`) | — |
| Llamar a una API | `core/http` (`http`, `createHttpClient`) | — |
| Responder desde `app/api` | `core/http/server` (`route`, `ok`, `parseJson`) | `app/api/health` |
| Variables de entorno | `core/env` (`publicEnv`; `serverEnv` en `core/env/server`) | `.env.example` |
| Toasts y alertas notch | `core/toast`, `core/alert` | `core/toast/README.md` |
| Trabajar sin conexión | `core/sync` | `core/sync/README.md` |
| Thunks y estado de carga | `store/utils`, `store/loadingSelectors` | `features/_example` |

## 5. Convenciones

- Textos de UI, comentarios y documentación **en español**; código (nombres) en inglés.
- Alias `@/` para imports entre carpetas; rutas relativas dentro de un mismo feature.
- Si el archivo no tiene JSX, es `.ts`. Una carpeta se crea cuando hay algo real que meterle.
- Specs de tareas grandes en `.ia/tasks/`; reglas que se aprendan, a `.ia/context/`.
- Antes de un PR: checklist al final de `.ia/context/arquitectura-en-capas.md`.
