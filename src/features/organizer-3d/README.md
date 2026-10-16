# organizer-3d — Aurora Organizer

Página de inicio (`/`; `/organizer` redirige ahí): un organizador 3D con sobres
extraíbles (hasta 8) y una interfaz de vidrio encima. Tres estilos, con los mismos
sobres y datos: **carpeta** de cuero con sobres plásticos, **cajonera** de cajones
translúcidos y **archivador** de acrílico con carpetas verticales.
Los saldos, movimientos y sobres vienen del **libro de movimientos**
(`features/ledger`), guardado en el dispositivo. El organizador solo los muestra y
anima; las acciones ("Mover dinero", crear/editar/archivar sobres) pasan por los
thunks del libro, que validan y guardan.

## Piezas

```
domain/envelopeView.ts         Lo que la carpeta necesita de un sobre (desde el libro) y el sobre vecino
domain/organizerView.ts        Máquina de estados visual: closed → open ⇄ browsing ⇄ reading
domain/document.ts             Documento = movimiento del libro visto desde un sobre (entra/sale); actividad
domain/documentFilter.ts       Filtros (día, fecha, semana lun–dom, mes, texto) y la frase que los describe
domain/transfer.ts             Formulario "Mover dinero": esquema y lectura del monto (las reglas son del libro)
domain/envelopeStyle.ts        Editar sobre: paleta, iconos, esquema (nombre único) y tono del papel
domain/gestures.ts             Gestos: toque vs. deslizamiento y qué hace cada uno según el estado
domain/organizerStyle.ts       Estilos (carpeta, cajonera, archivador): nombres, textos del botón, preferencia guardada
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
  EditEnvelopeDialog.tsx       Crear o editar un sobre (al editar, vista previa en vivo en la carpeta)
  useLedgerData.ts             El libro visto por el organizador (selectores y thunks de `ledger`)
  OrganizerBackdrop.tsx/.css   Fondo de habitación desenfocada (CSS; foto opcional)
  OrganizerCanvas.tsx          Monta/desmonta la escena del estilo (solo cliente, next/dynamic ssr:false)
  OrganizerStyleSelector.tsx   Selector de estilo: en la barra (escritorio) o sobre la escena (móvil)
  useOrganizerStyle.ts         Estilo elegido (localStorage, con respaldo en memoria; null al hidratar)
scene/                         Three.js directo, sin React
  contract.ts                  Contrato común de las escenas (OrganizerSceneApi, SceneIntent, SafeArea)
  createScene.ts               Estilo → escena (la única que sabe cuáles existen)
  organizerScene.ts            Carpeta: implementación del contrato y timelines GSAP
  runtime.ts                   Base de los estilos de ranuras: renderer, bucle, cámara, gestos, timelines
  slotModel.ts · slotScene.ts  Contrato de un modelo de ranuras y la escena genérica que lo anima
  cabinet/                     Cajonera: cabinetLayout (medidas y poses, puro) · cabinetModel (mallas)
  files/                       Archivador: filesLayout (medidas y poses, puro) · filesModel (mallas)
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
- **Un toque abre el sobre**: sin pasos intermedios de "enfocar" ni "extraer". El sobre
  sube en su plano hasta librar a los de enfrente (si avanzara antes los atravesaría),
  viene al frente y abre la boca con sus documentos, todo en una sola animación. Al
  regresar guarda los documentos y vuelve por el mismo camino a su bolsillo.
- **Cuero de color sólido** con mapas normal/rugosidad: el albedo del mapa era demasiado
  saturado frente al rosa empolvado de la referencia.
- **Colores de los sobres** son datos (como series de gráfica): van en `style`, iguales en
  ambos temas. El resto usa tokens; el coral de marca es `--primary` en `globals.css`.
- `prefers-reduced-motion`: duraciones en 0, sin flotación ni paralaje. Sin WebGL: aviso y
  la fila de sobres + tarjeta siguen funcionando.

## Estilos: carpeta, cajonera y archivador

Todos cumplen `OrganizerSceneApi` (`scene/contract.ts`); el controlador, la máquina de
estados y la interfaz no saben cuál está montado. Sacar el sobre ya abierto y
regresarlo son `openEnvelope` y `closeEnvelope`.

- **Carpeta** (`organizerScene.ts`): la original.
- **Cajonera** y **archivador** usan `slotScene`: un cuerpo fijo y una pieza móvil por
  sobre. El modelo (`SlotModel`) da geometría y poses (`rest`, `ajar`, `exitPath`,
  encuadres); la escena genérica anima entre poses con timelines de GSAP. Regresar
  recorre `exitPath` al revés, así la pieza vuelve por donde salió sin atravesar nada
  y termina exactamente en su pose. Al tocar otra pieza con una fuera, la anterior
  vuelve antes de que salga la nueva. "Cerrar" en estos estilos es la vista general
  (cámara más lejos); desde ahí también se puede tocar una pieza.
  - Cajonera: 2 columnas, filas según los sobres (3 para 6, 4 para 7–8). Hover: el
    cajón asoma; al tocarlo sale completo y viene al frente, inclinado para ver su
    interior. Al mover dinero, los cajones se entreabren (`ajar`) y las fichas caen dentro.
  - Archivador: carpetas en fila sobre placa champán y bandeja de acrílico. Hover:
    sube un poco; al tocarla sube hasta librar las paredes, sale al frente y viene al
    centro girando hacia la cámara.
- **Documentos en 3D** en los tres estilos, con el mismo módulo (`scene/documentDeck.ts`);
  cada estilo da sus poses (`DeckLayout` / `SlotModel.deck`). Carpeta: abanico arriba de
  la boca del sobre. Cajonera: fichero dentro del cajón, el más reciente al frente y a la
  derecha, los anteriores escalonados hacia atrás (el fajo de papel se oculta). Archivador:
  fichas que asoman por la boca de la carpeta. En los dos últimos las fichas se recortan
  bajo el piso o la boca (`clipY`, planos de recorte por material), así "salen de adentro";
  al filtrar, la que cambia de lugar baja y vuelve a subir en el nuevo, sin cruzar a nadie.
- **Cambiar de estilo** (selector en la barra o sobre la escena en móvil): el lienzo se
  desvanece (220 ms; nada con reduced motion), la escena anterior se libera (timelines,
  geometrías, materiales, texturas y contexto WebGL con `forceContextLoss`) y la nueva
  se monta en el mismo estado visual (`syncScene`): mismo sobre elegido, abierto o no.
  Siempre hay un solo canvas y un solo bucle. Si se cambia a media animación, la
  promesa de la escena anterior se resuelve al liberarla y no queda nada bloqueado. No
  toca el libro: cambiar de estilo no crea movimientos ni cambia saldos.
- **Un estilo nuevo** = otro `SlotModel` (geometría + poses) y un caso en `createScene.ts`.
- **Calidad adaptativa** en los estilos de ranuras: primero baja el pixel ratio y, ya en
  1, apaga las sombras dinámicas.

## Abrir el sobre y buscar documentos

Tocar un sobre (o "Abrir sobre" en la tarjeta): sale de la carpeta, el labio se
inclina y los movimientos asoman como tickets en abanico (máx. 8; el más reciente al frente). La búsqueda
(Todo · Día · Semana · Mes · Fecha + texto) reacomoda el abanico y la frase que la
describe (`describeFilter`) se escribe en Caveat en la tarjeta y en una etiqueta de
papel sobre el sobre. Tocar un ticket (o la lista) lo saca al frente; Escape retrocede
un nivel. **Solo se mueve el elegido:** sube en su plano hasta que su borde inferior
libra la punta de todos los demás y la boca (`travelY`), cruza a esa altura y baja
al frente; al regresar hace el camino al revés y baja en su plano, detrás de los
de enfrente. Nada se atraviesa y nadie más se mueve. El sobre presentado siempre queda delante de la pila; en pantallas angostas
se achica en lugar de meterse entre los demás.

## Mover dinero, crear, editar y archivar sobres

"Mover dinero" arma un movimiento `assignment` del libro y lo valida con
`checkMovement` antes de animar; al confirmar, las fichas viajan entre sobres y el
movimiento se guarda. Crear y archivar reacomodan la carpeta (`setEnvelopes` de la
escena: los nuevos crecen en su lugar, los archivados se encogen; caben 8 activos).
Archivar pide confirmación y solo aplica a sobres vacíos. Editar muestra la vista
previa en vivo y guarda nombre, descripción, color, icono y presupuesto (semanal o
mensual). Con presupuesto, el detalle muestra lo gastado en el periodo y el atajo
"Apartar" abre Mover con lo que falta, desde Disponible si alcanza.

Al registrar un movimiento (botón "Registrar") las fichas también se animan, según
`moneyFlowOf`: el ingreso llega de fuera a su sobre, el gasto sale, la compra con
tarjeta pasa del sobre a la reserva y el pago de tarjeta sale de la reserva
(`transfer(from, to)` de la escena, con `null` = fuera: un punto arriba a la derecha
del sobre en pantalla, dentro de la zona libre — `outsideNdc` —, para que la barra
o la tarjeta no lo tapen). Solo con la carpeta abierta
y sin un sobre fuera; depósito/retiro no se anima (no cambia sobres). Al cancelar
un movimiento las fichas hacen el camino inverso (`reversalFlowOf`); si se canceló
desde los documentos de un sobre abierto, el sobre regresa, las fichas se animan y
se vuelve a abrir con los documentos al día.

## Gestos (táctil y mouse)

| Estado | ← → | ↑ | ↓ |
|---|---|---|---|
| Cerrada | ← abre (la tapa sigue al dedo) | — | — |
| Abierta | sobre siguiente/anterior (en la tarjeta) | sobre un sobre: lo saca abierto | — |
| Sobre abierto | documento siguiente/anterior | sobre un ticket: lo saca | regresa el sobre |
| Documento fuera | documento siguiente/anterior | — | lo regresa |

Mientras se arrastra, la tapa (o la pieza presentada en cajonera y archivador) sigue al dedo; si el gesto no alcanza
(distancia o velocidad), vuelven a su lugar. En "cerrada" y "abierta" el lienzo usa
`touch-action: pan-y` (deslizar en vertical desplaza la página); con un sobre
abierto usa `none` y recibe todos los gestos. En pantallas táctiles una pista arriba
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
de Aurora Organizer). La cajonera y el archivador reutilizan estas mismas
texturas (grano del cuero, micro-relieve del plástico, papel) y materiales
procedurales (acrílico, laca, metal champán); etiquetas en canvas.

Assets adicionales que **mejorarían** el acabado (ninguno es necesario para que
funcione): un mapa de normales de plástico esmerilado más fino para los cajones y
un HDRI pequeño de estudio (≤ 1 MB) para reflejos más ricos en el acrílico y el metal.
