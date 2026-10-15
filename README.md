# Aurora Template

Plantilla de Next.js 16 para sistemas internos y SaaS, con arquitectura por
capas, sistema de diseño shadcn/Radix y las piezas que se repiten en cada
proyecto: manejo de errores de punta a punta, toasts y alertas notch, tabla con
filtros, importación de Excel y un outbox para trabajar sin conexión.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

- **`/`** — bienvenida y primeros pasos.
- **`/showcase`** — ejemplos vivos de cada pieza.
- **`/example`** — un feature completo con todas las capas, para copiar.

**Empieza por [`AGENTS.md`](./AGENTS.md):** dice qué borrar o conservar al
iniciar un proyecto, y enlaza a la arquitectura (`.ia/context/`) y a las guías
de cada pieza.

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm verify` | Tipos + lint + tests (antes de cada commit) |
| `pnpm build` | Build de producción |
| `pnpm test:watch` | Tests en modo observación |
