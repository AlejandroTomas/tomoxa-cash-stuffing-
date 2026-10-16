# Abrir un sobre, ver sus documentos y buscarlos a mano

**Estado:** implementada (2026-10-15), pendiente de revisión del usuario y commit. Al aprobarla, borrar esta spec.
**Feature:** `src/features/organizer-3d` (ver su README).

## Qué se pidió

Al elegir un sobre, poder **abrirlo como una carpeta con varios documentos** y
**sacar el que buscamos**. Para encontrarlo, una **búsqueda dentro del sobre** por
fecha, día y semana, que se **escribe en cursiva con animación de escritura a mano**,
para reducir los documentos de forma interactiva.

## Recorrido

```
carpeta abierta → sobre enfocado → sobre extraído
  → [Abrir sobre]  la solapa gira en su bisagra; los documentos asoman en abanico
  → [Filtro]       el filtro se "escribe" a mano; los que no coinciden bajan al
                   sobre y los que sí suben; contador "3 de 8"
  → [Documento]    tocar uno: sale del sobre al frente; la tarjeta muestra su detalle
  → [Regresar]     el documento vuelve a su lugar · [Cerrar sobre] baja la solapa
```

Escape retrocede un nivel en ese orden. Todo tiene su equivalente HTML (lista de
documentos y controles de filtro en la tarjeta) para teclado y lector de pantalla.

## Qué es un documento

Un **movimiento** del sobre (lo que la tarjeta ya cuenta como "Movimientos: 8"):
ticket o comprobante con fecha, concepto, tipo y monto. Hoy sale del mock; en la
fase 2 sale del libro de movimientos, con la misma forma, así que la escena no cambia.

```ts
// mocks/ (única fuente de datos ficticios)
interface EnvelopeDocument {
  id: string;
  envelopeId: EnvelopeId;
  date: string;          // "YYYY-MM-DD", fecha local (nunca new Date("YYYY-MM-DD"): es UTC)
  concept: string;       // "Súper", "Gasolina", "Pago tarjeta"…
  kind: "income" | "expense" | "assignment" | "payment";
  amountMinor: number;   // centavos, entero
}
```

`envelopesMock[i].movements` y `lastMovement` pasan a **derivarse** de los documentos
(un test lo garantiza) para que no haya dos fuentes.

## Búsqueda

Lógica pura en `domain/documentFilter.ts` (con tests), sin React ni Three.js:

| Filtro | Ejemplo escrito a mano | Regla |
|---|---|---|
| Todo | *Todos los movimientos* | sin filtro |
| Día de la semana | *Los lunes* | `getDay(fecha)` |
| Fecha | *El 6 de octubre* | mismo día local |
| Semana | *Semana del 6 al 12 de oct* | lunes a domingo (es-MX), `startOfWeek({ weekStartsOn: 1 })` |
| Accesos rápidos | *Esta semana* · *Semana pasada* · *Este mes* | relativos a "hoy" inyectado (testeable) |
| Texto (opcional) | *"súper"* | concepto, sin acentos ni mayúsculas |

Los filtros se combinan (p. ej. semana + texto). La frase que se escribe a mano la
genera `describeFilter(filter)` (también pura y probada), así que lo que se lee
siempre coincide con lo que se filtra. Fechas con `date-fns` (ya instalado), locale `es`.

## Escritura a mano

No la escribe el usuario a mano: es la **caligrafía** la que debe parecer manuscrita.
El usuario elige el filtro con controles normales y la frase resultante se muestra en
letra cursiva, con una animación como si se estuviera escribiendo.

- **Fuente:** **Caveat** (OFL), servida por `next/font` (sin CDN en producción).
- **Animación:** el texto se revela de izquierda a derecha letra por letra, con una
  máscara que sigue una "punta de pluma" y un leve temblor de trazo; ~40 ms por letra,
  máx. 1.2 s. Reescribir al cambiar el filtro: borrar rápido y volver a escribir.
- **Dónde:** en ambas: (a) una etiqueta de papel sujeta al sobre abierto, dentro de la
  escena (textura de canvas que se redibuja solo mientras escribe), y (b) la tarjeta HTML
  como título del filtro (la versión accesible).
- `prefers-reduced-motion`: el texto aparece completo, sin animación. El texto real
  siempre está en el HTML (`aria-live`), no solo en el canvas.

## Escena (Three.js)

- **Solapa** del sobre con bisagra en el borde superior trasero (`flapPivot`).
- **Documentos** creados **solo para el sobre abierto** y liberados al cerrarlo
  (geometría compartida + una textura de canvas por documento: concepto, fecha y monto).
- **Abanico de máx. 8** documentos; si hay más, los demás quedan en la lista HTML ("+N").
- **Filtrado animado:** los que no coinciden bajan y se atenúan; los que sí, suben y se
  reordenan. GSAP con `stagger`, protegido contra cambios rápidos (el último gana).
- **Documento fuera:** se presenta al frente igual que hoy el sobre extraído
  (`presentDepth` para que no se recorte en móvil).
- La escena sigue sin poder modificar montos: solo recibe `readonly EnvelopeDocument[]`.

## Estados (máquina en `domain/organizerView.ts`)

```
extracted ──OPEN_ENVELOPE──▶ browsing ──PICK_DOCUMENT(id)──▶ reading
    ▲                          │  ▲                              │
    └──────CLOSE_ENVELOPE──────┘  └────────RETURN_DOCUMENT───────┘
```

El filtro **no es un estado** de la máquina: es dato de la vista (`filter`) y solo
cambia qué documentos están "arriba". `CLOSE` desde cualquier estado cierra todo en
orden (documento → solapa → sobre → carpeta).

## Interfaz (tarjeta de la derecha)

En `browsing`/`reading` la tarjeta cambia a "Documentos de {sobre}":

- Frase del filtro en cursiva (animada) + contador "3 de 8".
- Controles: segmentado *Todo · Día · Semana · Fecha*, accesos rápidos y búsqueda por
  texto (Popover con `Calendar` de shadcn para fecha y semana).
- Lista de documentos (la alternativa accesible al abanico) y detalle del elegido.
- Móvil: la misma tarjeta debajo de la escena; los controles en una sola fila con scroll.

## Fuera de alcance

Crear, editar o borrar documentos y adjuntar fotos de tickets (fase 2). Nada se guarda.

## Criterios de aceptación

- [x] Se abre cualquier sobre extraído y se ven sus documentos; se saca y regresa cualquiera.
- [x] Cada filtro reduce el abanico y la lista a lo mismo; el contador coincide.
- [x] La frase en cursiva se escribe con animación y coincide con el filtro aplicado.
- [x] Semana lunes–domingo correcta en cambios de mes y de año; fechas locales sin corrimiento UTC (tests).
- [x] Teclado completo (Escape retrocede; flechas recorren documentos) y `aria-live` con el resultado.
- [ ] Reduce-motion: implementado, sin probar en navegador.
- [x] Al cerrar el sobre se liberan geometrías y texturas (10 ciclos sin errores; memoria no medida).
- [x] 375 y 1565 px sin scroll horizontal; claro y oscuro. 768 px sin revisar con el sobre abierto.
- [x] `pnpm verify` y `pnpm build` pasan.

## Fases de implementación

1. Datos y dominio: `EnvelopeDocument` mock, filtros, `describeFilter`, estados nuevos y tests.
2. Escena: solapa, documentos, abrir/cerrar, sacar/regresar, filtrado animado.
3. Interfaz: modo "Documentos" de la tarjeta, controles, lista y detalle.
4. Escritura a mano: fuente, animación en HTML y en la etiqueta 3D.
5. Revisión en navegador (temas, tamaños, teclado) y limpieza de recursos.

## Decisiones tomadas

1. La caligrafía parece manuscrita (Caveat + animación de escritura); el usuario no dibuja.
2. Se muestra en la escena (etiqueta de papel) y en la tarjeta.
3. Filtros: todos los de la tabla, incluida la búsqueda por texto.
