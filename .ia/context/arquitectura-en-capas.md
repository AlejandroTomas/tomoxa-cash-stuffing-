# La arquitectura en una página

El estándar de capas de Ahorroxa, aterrizado en **Next 16 con App Router**.

## El mapa

```
src/app/              Rutas. Las páginas son delgadas: montan el componente del feature.
src/app/api/**        El backend (Route Handlers): validan, llaman al dominio, responden ApiResult.
src/features/<x>/     Un dominio del negocio. Todo lo de ese dominio vive aquí.
src/components/       UI sin dominio (ui/ = primitivas de shadcn).
src/core/             Infraestructura: errors, logger, env, http (servidor), toast, alert.
src/store/            Store de Redux: loadingSlice, wrapper de thunks, middleware de errores.
src/hooks/            Hooks sin dominio.
src/utils/            Funciones puras sin dominio ni I/O.
src/types/            Tipos compartidos entre features.
src/lib/utils.ts      Solo `cn()` (shadcn lo espera ahí).
```

## Las capas de un feature

Referencia viva: `src/features/ledger/` (y su README).

```
features/orders/
├── repositories/   Habla con el mundo exterior (IndexedDB con Dexie, o una API). Nada más.
├── services/       Reglas de negocio. Valida, decide, orquesta repositorios.
├── actions/        Thunks delgados: llaman a UN método del service.
├── domain/         Cálculo puro sobre datos en memoria.
├── errors/         Errores tipados del dominio (extienden core/errors).
├── dto/            Lo que el caller decide al crear/editar.
├── components/     La UI de este dominio.
├── selector.ts     Lectores del store.
├── ordersSlice.ts  El estado (y reexporta los thunks).
└── README.md       Qué es y decisiones que no se ven en el código.
```

**La flecha va en un solo sentido:**

```
componente → action (thunk) → service → repository → core/http → app/api/** → base de datos
     ↑            ↘               ↘
  selector     loadingSlice      domain
```

Nadie salta hacia atrás: un repository no conoce al service; un service no
sabe que existe React; `core/` no conoce a nadie de arriba.

## Qué va en cada capa

| Capa | Va | No va |
|---|---|---|
| **repositories/** | Lecturas y escrituras en Dexie (o en una API si algún día la hay). Un método por consulta, con nombre de negocio. | Un `if` de negocio, un toast, un try/catch. |
| **services/** | Validar, decidir, orquestar repositorios, lanzar el error tipado. | Acceso a datos crudo. React. `showToast`. |
| **actions/** | `createAsyncThunkWithErrorHandling` que llama a un service. | Lógica, try/catch, UI. |
| **domain/** | Funciones puras: totales, validaciones, agrupaciones. | I/O, async. |
| **errors/** | Clases que extienden `AppError` (y sus subclases). | Mensajes técnicos para el usuario. |
| **components/** | JSX, hooks, `dispatch`, `useAppSelector`. | `core/http`, `fetch`, reglas de negocio. |
| **app/api/** | `route()`, `parseJson(request, zodSchema)`, `ok()`, lanzar `AppError`. | Lógica de UI, respuestas con forma propia. |

## Las reglas

1. **El componente no toca datos.** Ni `core/http` ni `fetch` en un `.tsx` o un hook. *(ESLint)*
2. **El thunk llama a un service**, nunca a un repository.
3. **Un feature no importa `repositories/` ni `actions/` de otro.** Pide a su
   service; los thunks se importan del slice. Dentro del propio feature, rutas
   relativas. *(ESLint)*
4. **`components/` no conoce features** y **`core/` no conoce a nadie de arriba.** *(ESLint)*
5. **`extraReducers` siempre en forma `builder`.**
6. **El `typePrefix` es único en todo el store:** `"orders/fetch"`, no `"fetch"`.
7. **Loading y error no van en el slice:** se leen con `selectIsLoading(thunk)`.
   Para saber cómo terminó un dispatch, `await dispatch(x).unwrap()`, no el store.
8. **Los reducers y los thunks no muestran UI.** Los errores de thunks llegan
   solos al panel de alertas (middleware). Un thunk de fondo: `{ silent: true }`.
9. **Nada de `console.log`.** Errores con `reportError(error, { context })`; al
   usuario solo el mensaje seguro (`AppError.message` o el genérico). *(ESLint)*
10. **Nada de `any`.** *(ESLint, error)*
11. **Una carpeta se crea cuando hay algo real que meterle**, no por simetría.
12. **Si el archivo no tiene JSX, es `.ts`.**

## Dónde va algo nuevo

- ¿Habla del negocio (pedido, cliente, factura)? → `features/<x>/`.
- ¿UI que sirve a cualquier dominio? → `components/<categoría>/`.
- ¿Función pura sin dominio? → `utils/`.
- ¿Infraestructura que usan varios dominios? → `core/`.
- ¿Solo corre en el servidor? → `app/api/**` (y `import "server-only"` si es un módulo).

Para un componente el criterio es **lo que es, no quién lo importa**: si nombra
tipos de un dominio o lee su slice, es de ese feature aunque lo use media app.

## Errores, de punta a punta

```
servidor: throw new NotFoundError("El pedido no existe.")  → route() → 404 { ok:false, message }
cliente:  core/http lo convierte en NotFoundError           → el service lo deja subir (o lo traduce)
          el thunk: reportError + rechazo con mensaje seguro → middleware → panel de alertas
          el componente: unwrap() en try/catch solo para lo propio (error de un campo)
```

`AppError.message` es siempre seguro para el usuario; el detalle va en
`debugMessage`/`cause` y solo llega a `reportError`.

## Antes de borrar algo "sin uso"

Al iniciar un proyecto se borra mucho; vale verificar dos cosas:

1. **¿Alguien lo importa?** `grep -rn "NombreDelArchivo" src`. Ojo con barrels
   (`index.ts`) que reexportan, y con imports dinámicos (`import("…")`).
2. **¿Se usa dentro del propio archivo?** Una función sin llamadas externas
   puede sostener a otra del mismo archivo.

Y después de borrar: `pnpm verify` (tipos, lint y tests) y `pnpm build`, que
detecta cosas que `tsc` no (p. ej. `server-only` importado desde el cliente).

## Antes de abrir un PR

- [ ] Ningún componente toca `core/http`/`fetch`; las consultas viven en un `repositories/`.
- [ ] Las reglas de negocio están en un service, con errores tipados.
- [ ] Thunks con `createAsyncThunkWithErrorHandling` y `typePrefix` único.
- [ ] Sin `console.log` ni `any`; colores por token (ver `sistema-diseno.md`).
- [ ] `pnpm verify` pasa y `pnpm build` también.
- [ ] Si el módulo cambió de forma, su `README.md` lo refleja.
- [ ] Borré el código viejo que este cambio reemplaza. **Si no borras, no migraste: duplicaste.**
