# .ia

Contexto para trabajar en este repo con IA (Claude Code y similares). No es
código de la aplicación: son las reglas y decisiones que un agente (o una
persona nueva) debe leer antes de cambiar algo. El punto de entrada es
`AGENTS.md` en la raíz.

- `context/` — documentos persistentes:
  - [`arquitectura-en-capas.md`](./context/arquitectura-en-capas.md) — capas, reglas, checklist de PR. **Léelo primero.**
  - [`sistema-diseno.md`](./context/sistema-diseno.md) — tokens, tipografía y qué componente usar para qué.
- `tasks/` — specs de tareas grandes o pendientes: qué se pide, alcance y
  criterio de aceptación. Se borran al terminarlas; lo que valga como regla se
  muda a `context/`.

Las guías de cada pieza viven junto a su código: `core/toast/README.md`,
`features/ledger/README.md`, `features/organizer-3d/README.md`.
