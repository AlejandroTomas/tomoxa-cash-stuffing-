# Ahorroxa

Tus sobres de dinero (cash stuffing) en un organizador 3D: carpeta de anillas,
cajonera o archivador. Tocas un sobre y sale abierto con sus movimientos;
mueves dinero entre sobres y las fichas viajan de uno a otro. Cuentas, tarjeta,
presupuestos y respaldo, todo guardado en el dispositivo (IndexedDB).

```bash
pnpm install
cp .env.example .env.local
pnpm dev          # http://localhost:3000
```

Next 16 · React 19 · TypeScript · Tailwind v4 + shadcn/Radix · Redux Toolkit ·
Three.js + GSAP · Dexie. **Empieza por [`AGENTS.md`](./AGENTS.md):** arquitectura,
sistema de diseño y dónde vive cada cosa.

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm verify` | Tipos + lint + tests (antes de cada commit) |
| `pnpm build` | Build de producción |
| `pnpm test:watch` | Tests en modo observación |

El ícono vive en `src/app/icon.svg` (y `AhorroxaMark` en la barra); los PNG y el
`.ico` de `public/` se generan desde ese SVG.
