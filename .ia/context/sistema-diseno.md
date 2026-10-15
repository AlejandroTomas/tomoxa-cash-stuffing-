# El sistema de diseño

**Es la especificación, no inspiración.** Describe lo que la plantilla ya tiene;
todo proyecto que salga de aquí lo conserva (los colores de marca se cambian en
los tokens, no componente por componente).

## Fundamento

- **shadcn/ui**, estilo `new-york`, base `slate`, `cssVariables: true`, iconos
  `lucide`. Config en `components.json`. Primitivas en `src/components/ui/`.
- **Tailwind v4** vía `@tailwindcss/postcss`. No hay `tailwind.config.js`: el
  tema se declara en CSS, en `src/styles/globals.css` (`@theme inline`).
- **Radix** debajo de cada primitiva. Un componente nuevo se arma con las
  primitivas de `ui/`, no con otra librería de UI.
- **Tema oscuro por clase** (`.dark`, `next-themes`), no por `prefers-color-scheme`.
- **`cn()`** de `@/lib/utils` para combinar clases.
- Agregar una primitiva: `pnpm dlx shadcn@latest add <componente>`.

## Tokens de color

En oklch, con dos juegos (`:root` y `.dark`). **Se usan por nombre, nunca por valor.**

| Grupo | Tokens | Para qué |
|---|---|---|
| Superficie | `background`, `card`, `popover` | Fondo de página, tarjeta, flotante |
| Texto | `foreground`, `muted-foreground`, `*-foreground` | Principal y secundario |
| Acento | `primary`, `secondary`, `accent`, `muted` | Acciones y realces |
| Estado | `destructive` | Borrar, error, riesgo |
| Trazo | `border`, `input`, `ring` | Bordes, campos, foco |
| Nav | `sidebar`, `sidebar-*` | El menú lateral |
| Datos | `chart-1` … `chart-5` | Series de gráficas |

**Regla dura:** un color fijo (`bg-white`, `text-gray-500`, `bg-red-500`) se ve
bien en claro y se rompe en oscuro. Excepciones válidas, y solo éstas:

1. Superficie translúcida sobre un fondo de color propio (`bg-white/20` en una
   tarjeta con degradado).
2. **Paleta propia intencional, igual en ambos temas:** el notch de toasts y
   alertas (`core/toast/tokens.ts`) y `NetworkBanner` se leen como avisos del sistema.
3. Color funcional (el fondo blanco de un QR que se escanea).

Pendiente: barrer los colores fijos que quedan en componentes heredados (ver
`../tasks/tokens-de-color.md`). Un archivo que tocas se pasa a tokens.

## Radios

Un solo origen: `--radius: 0.625rem` (10px). `rounded-sm` 6 · `rounded-md` 8 ·
`rounded-lg` 10 · `rounded-xl` 14 · `rounded-2xl` 18. **Nunca `rounded-[18px]`.**

## Tipografía

- Fuente: **Geist** (sans y mono), cargada con `next/font` en `app/layout.tsx`.
- Título de página: `text-xl font-bold text-foreground`. Subtítulo: `text-sm text-muted-foreground`.
- Jerarquía secundaria: baja a `muted-foreground` o al peso; no inventes grises.
- **`tabular-nums`** en números que deben alinearse en columna (tablas, montos
  apilados, horas). Un número grande y suelto (el valor de un `StatTile`) va con
  cifras proporcionales: `tabular-nums` lo hace ver separado.

## Piezas ya construidas: úsalas, no las reinventes

| Necesidad | Usa |
|---|---|
| Marco de página (título, icono, acciones) | `components/layouts/PageScaffold` |
| Layout con menú lateral | `components/layouts/AdminLayout` + `Sidebar` |
| Tabla con búsqueda/filtros/orden/paginación | `components/compound/PaginatedTable` |
| Barra de filtros (para tabla o API) | `components/filters/FilterBar` |
| Aviso breve | `toast` de `@/core/toast` |
| Error o resultado que hay que leer y cerrar | `alertService` de `@/core/alert` |
| Confirmación | `showDialog()` de `utils/dialogService` |
| Diálogo que en móvil es hoja inferior | `components/ui/responsive-dialog` (`Credenza*`) |
| Agrupar campos de un formulario | `components/form/FormSection` |
| KPI con variación | `components/shared/StatTile` |
| Importar Excel | `components/import/ExcelImportModal` |
| Estado del outbox | `components/feedback/OutboxStatusPanel` |

Todas tienen ejemplo vivo en `/showcase`.

## Accesibilidad mínima

- Botones de solo icono con `aria-label`.
- Campos con `<Label htmlFor>`; error del campo con `aria-invalid` y `aria-describedby`.
- No quitar el anillo de foco (`focus-visible:ring`).
- Respetar `prefers-reduced-motion` en animaciones propias.
