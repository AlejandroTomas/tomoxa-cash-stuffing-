# organizer-3d — Aurora Organizer (fase 01, solo visual)

Página de inicio (`/`; `/organizer` redirige ahí): carpeta de cuero sintético en
3D con seis sobres plásticos extraíbles y una interfaz de vidrio encima, según
`aurora-organizer-3d/public/assets/reference/aurora-concept.png`.
**Los importes, movimientos y fechas son mock** (`mocks/envelopes.mock.ts`, única
fuente) y nada aquí mueve, guarda ni sincroniza dinero. "Mover dinero" y "Editar"
solo muestran un aviso.

## Piezas

```
mocks/envelopes.mock.ts        Sobres de demostración (nombre, color, icono, importe)
mocks/documents.mock.ts        Movimientos ficticios de cada sobre (única fuente; la tarjeta cuenta de aquí)
domain/organizerView.ts        Máquina de estados visual: closed → open → focused ⇄ extracted ⇄ browsing ⇄ reading
domain/document.ts             Documento = movimiento; actividad derivada (movimientos, último)
domain/documentFilter.ts       Filtros (día, fecha, semana lun–dom, mes, texto) y la frase que los describe
domain/localDate.ts            Fechas "YYYY-MM-DD" locales (sin corrimiento UTC)
domain/transfer.ts             Mover dinero: validar monto/saldo, aplicar, movimientos que deja
domain/envelopeStyle.ts        Editar sobre: paleta, iconos, esquema (nombre único) y tono del papel
domain/gestures.ts             Gestos: toque vs. deslizamiento y qué hace cada uno según el estado
errors/organizer-errors.ts     WebGLUnavailableError (caso esperado: se reporta como aviso)
components/
  OrganizerExperience.tsx      Composición a pantalla completa y medición de la "zona libre"
  useOrganizerController.ts    Una acción a la vez; intro (abre sola); teclado (flechas, Escape)
  OrganizerNav.tsx             Barra de vidrio: marca, secciones, tema claro/oscuro, perfil demo
  EnvelopeDetailCard.tsx       Tarjeta del sobre seleccionado (monto, movimientos, acciones)
  EnvelopeTiles.tsx            Fila de seis sobres: alternativa HTML completa al lienzo
  DocumentsPanel.tsx           Sobre abierto: frase en caligrafía, filtros, lista y documento fuera
  HandwrittenText.tsx · fonts.ts  Caligrafía Caveat (next/font) que "se escribe" letra por letra
  MoveMoneyDialog.tsx          "Mover dinero" (Credenza + react-hook-form + Zod)
  EditEnvelopeDialog.tsx       "Editar sobre" con vista previa en vivo en la carpeta
  useDemoLedger.ts             Estado de DEMOSTRACIÓN en memoria (saldos, estilos, movimientos nuevos)
  OrganizerBackdrop.tsx/.css   Fondo de habitación desenfocada (CSS; foto opcional)
  OrganizerCanvas.tsx          Monta/desmonta la escena (solo cliente, next/dynamic ssr:false)
scene/                         Three.js directo, sin React
  organizerScene.ts            API imperativa (open/close/focus/extract/returnEnvelope/clearFocus/setSafeArea) y timelines GSAP
  stage.ts                     Renderer, luces, entorno procedural (RoomEnvironment), sombras
  binder.ts · envelope.ts      Carpeta (lomo, anillas, correa, banda, hojas) y sobres (bolsa esmerilada, pestañas)
  materials.ts · labels.ts     Materiales compartidos (un dueño, se liberan juntos) y etiquetas en canvas
  documents.ts · documentTexture.ts  Tickets del sobre abierto (se crean al abrir, se liberan al cerrar)
  captionTag.ts                Etiqueta de papel con la frase de búsqueda, escrita en la escena
  moneyTokens.ts               Fichas de dinero genéricas que vuelan entre sobres al mover
  layout.ts · framing.ts       Medidas, bolsillos, abanicos y encuadre de cámara: puro, con tests
```

## Decisiones

- **Render en reposo: 0 cuadros.** Tras 6 s sin interacción ni animaciones (GSAP), la
  escena deja de dibujarse; cualquier puntero, animación, cambio de tamaño, textura o
  fuente cargada la despierta. También se pausa fuera de pantalla o con la pestaña oculta.
- **Calidad adaptativa:** si los cuadros promedian más de 25 ms (~40 fps), el pixel ratio
  baja de 0.25 en 0.25 hasta 1 (nunca sube, para no oscilar). Máx. inicial 1.75.

- **Carpeta en 3/4** (`BINDER.tilt`) y **sobres en abanico** al abrir: giran sobre su borde
  inferior (`slotPose(i, true)`); cerrada quedan planos para que la tapa no los atraviese.
- **Zona libre**: la interfaz mide qué tapa del lienzo (nav, tarjeta, botón) y la escena
  centra la carpeta en el resto con `camera.setViewOffset` (`setSafeArea`). En escritorio la
  carpeta queda a la izquierda de la tarjeta; en móvil todo se apila.
- **Intro**: al cargar, la carpeta se abre sola. Se difiere un tick para que en desarrollo
  (StrictMode monta dos veces) solo la escena que sobrevive la reciba.
- **Enfocar no saca al sobre de su plano** (solo asoma): si avanzara atravesaría a los de
  enfrente. La extracción sí sale al frente, después de deslizarse hacia arriba.
- **Cuero de color sólido** con mapas normal/rugosidad: el albedo del mapa era demasiado
  saturado frente al rosa empolvado de la referencia.
- **Colores de los sobres** son datos (como series de gráfica): van en `style`, iguales en
  ambos temas. El resto usa tokens; el coral de marca es `--primary` en `globals.css`.
- `prefers-reduced-motion`: duraciones en 0, sin flotación ni paralaje. Sin WebGL: aviso y
  la fila de sobres + tarjeta siguen funcionando.

## Abrir el sobre y buscar documentos

Sobre extraído → "Abrir sobre" (o tocarlo): el labio se inclina y los movimientos
asoman como tickets en abanico (máx. 8; el más reciente al frente). La búsqueda
(Todo · Día · Semana · Mes · Fecha + texto) reacomoda el abanico y la frase que la
describe (`describeFilter`) se escribe en Caveat en la tarjeta y en una etiqueta de
papel sobre el sobre. Tocar un ticket (o la lista) lo saca al frente; Escape retrocede
un nivel. El sobre presentado siempre queda delante de la pila; en pantallas angostas
se achica en lugar de meterse entre los demás. Spec: `.ia/tasks/sobre-documentos-y-busqueda.md`.

## Mover dinero y editar sobres (demostración)

"Mover dinero" valida el monto contra el saldo del origen, cierra el diálogo y anima
fichas que salen de la boca del sobre de origen y caen en la del destino; después
actualiza saldos y agrega un movimiento en cada sobre. "Editar" cambia nombre, color
e icono con vista previa en vivo (en escritorio el diálogo va a la derecha para no
tapar la carpeta). Todo vive en `useDemoLedger`: en memoria, se pierde al recargar.
La capa de datos real (fase 2) reemplaza ese hook sin tocar la escena.

## Gestos (táctil y mouse)

| Estado | ← → | ↑ | ↓ |
|---|---|---|---|
| Cerrada | ← abre (la tapa sigue al dedo) | — | — |
| Abierta / enfocado | sobre siguiente/anterior | sobre el enfocado: lo saca; sobre otro: lo enfoca | — |
| Sobre fuera | — | lo abre | lo regresa |
| Sobre abierto | documento siguiente/anterior | sobre un ticket: lo saca | cierra el sobre |
| Documento fuera | documento siguiente/anterior | — | lo regresa |

Mientras se arrastra, la tapa o el sobre siguen al dedo; si el gesto no alcanza
(distancia o velocidad), vuelven a su lugar. En "cerrada" y "abierta" el lienzo usa
`touch-action: pan-y` (deslizar en vertical desplaza la página); con un sobre
elegido usa `none` y recibe todos los gestos. En pantallas táctiles una pista arriba
del lienzo dice qué gesto aplica. Vibración corta (Android) al reconocer un gesto.

## Fondo fotográfico

`public/assets/organizer/backdrop.jpg` (1672×941, JPEG 82 %, ~140 KB): habitación cálida
desenfocada generada para el proyecto. Se activa en `OrganizerBackdrop.tsx`
(`BACKDROP_PHOTO`); en tema oscuro un velo la oscurece. Con `null` vuelve el fondo
hecho solo con CSS (degradados, bokeh, planta y bowl). Para cambiarla: misma ruta,
≥ 1600 px de ancho, con la mitad izquierda despejada (ahí va la carpeta).

## Assets

`public/assets/organizer/textures/`: `leather_{normal,roughness}.png`,
`plastic_normal.png`, `paper_basecolor.png` (512×512, originales del starter
`aurora-organizer-3d`, ver su `docs/ASSETS.md`).
