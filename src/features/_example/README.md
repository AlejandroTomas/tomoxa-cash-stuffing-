# features/_example — módulo de referencia

Un feature completo y pequeño (tareas) con **todas las capas**, para copiarlo al
crear uno nuevo. Se ve en `/example`; su API está en `app/api/example/tasks`.

## Crear un feature a partir de este

1. Copia la carpeta: `cp -r src/features/_example src/features/orders`.
2. Renombra entidad, archivos y el `typePrefix` de los thunks
   (`"exampleTasks/…"` → `"orders/…"`, **único en todo el store**).
3. Registra el slice en `src/store/reducers.ts` y, si quieres títulos en las
   alertas de error, el prefijo en `MODULE_TITLES` de `src/store/index.ts`.
4. Borra las carpetas que no uses: un feature solo de UI se queda con
   `components/`. Una carpeta se crea cuando hay algo real que meterle.
5. Escribe aquí qué hace el módulo y cualquier decisión que no se deduzca del código.

Para **quitar el ejemplo**: borra esta carpeta, `app/example`, `app/api/example`,
su línea en `store/reducers.ts`, su título en `MODULE_TITLES` (`store/index.ts`) y el ítem "Feature de ejemplo" de
`components/layouts/AdminLayout.tsx`.

## El flujo

```
TaskBoard (components/) ─dispatch→ createTask (actions/) → taskService.create (services/)
        ↑ useAppSelector                                    ├→ normalizeTitle (domain/)
  selectTasks (selector.ts) ← exampleTasksSlice              └→ taskRepository.create (repositories/) → core/http → API
```

Nadie salta hacia atrás: el repository no conoce al service, el service no
conoce React. Si algo falla, el service lanza un error de `errors/`, el thunk
lo reporta y lo rechaza con mensaje seguro, y el middleware lo muestra en el
panel de alertas. El componente solo pinta lo propio (el error del campo).

## Qué es público

Otros features pueden importar: `services/`, `domain/`, `errors/`,
`components/`, `selector.ts` y el slice (que reexporta los thunks).
`repositories/` y `actions/` son privados; ESLint lo hace cumplir.
