# Pasar a tokens los colores fijos heredados

**Estado:** abierta. Medido al crear la plantilla (2026-10-15).

Componentes que vinieron de proyectos anteriores todavía usan colores fijos
(`bg-gray-*`, `text-red-*`, `bg-white/10`…). En tema claro casi siempre se ven
bien; en oscuro algunos se pierden. Regla en `../context/sistema-diseno.md`.

| Archivo | Literales |
|---|---|
| `components/compound/ConfirmDialog.tsx` | 8 (colores por tipo de diálogo) |
| `components/layouts/Sidebar.tsx` | 6 (hover `bg-white/10`: no se ve en claro) |
| `components/compound/SpotlightSearch.tsx` | 4 |
| `components/form/AsyncSelect.tsx`, `feedback/NetworkBanner.tsx`, `compound/ErrorBoundary.tsx` | 3 c/u |
| `components/form/PinInputCustom.tsx`, `compound/Modal.tsx`, `compound/Alert.tsx` | 2 c/u |

Ya pasados a tokens: `form/EyeToggle.tsx`, `auth/LogOutBtn.tsx`.

`NetworkBanner` es excepción válida (paleta propia en ambos temas); revisar el resto.

**Criterio de aceptación:** cada literal se reemplaza por un token o se justifica
con una de las tres excepciones del sistema de diseño, revisado en ambos temas.

Para medir: `grep -rnE "bg-(white|black|gray|slate|red|green|blue)-|text-(white|gray|slate|red|green|blue)-" src --include="*.tsx"`.
