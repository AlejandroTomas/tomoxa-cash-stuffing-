# organizer-3d — Aurora Organizer (fase 01, solo visual)

Página de inicio (`/`; `/organizer` redirige ahí): carpeta de cuero sintético en
3D con seis sobres plásticos extraíbles y una interfaz de vidrio encima, según
`aurora-organizer-3d/public/assets/reference/aurora-concept.png`.
**Los importes, movimientos y fechas son mock** (`mocks/envelopes.mock.ts`, única
fuente) y nada aquí mueve, guarda ni sincroniza dinero. "Mover dinero" y "Editar"
solo muestran un aviso.

## Piezas

```
mocks/envelopes.mock.ts        Sobres de demostración (nombre, color, icono, importe, movimientos)
domain/organizerView.ts        Máquina de estados visual: closed → open → focused ⇄ extracted
components/
  OrganizerExperience.tsx      Composición a pantalla completa y medición de la "zona libre"
  useOrganizerController.ts    Una acción a la vez; intro (abre sola); teclado (flechas, Escape)
  OrganizerNav.tsx             Barra de vidrio: marca, secciones, tema claro/oscuro, perfil demo
  EnvelopeDetailCard.tsx       Tarjeta del sobre seleccionado (monto, movimientos, acciones)
  EnvelopeTiles.tsx            Fila de seis sobres: alternativa HTML completa al lienzo
  OrganizerBackdrop.tsx/.css   Fondo de habitación desenfocada (CSS; foto opcional)
  OrganizerCanvas.tsx          Monta/desmonta la escena (solo cliente, next/dynamic ssr:false)
scene/                         Three.js directo, sin React
  organizerScene.ts            API imperativa (open/close/focus/extract/returnEnvelope/clearFocus/setSafeArea) y timelines GSAP
  stage.ts                     Renderer, luces, entorno procedural (RoomEnvironment), sombras
  binder.ts · envelope.ts      Carpeta (lomo, anillas, correa, banda, hojas) y sobres (bolsa esmerilada, pestañas)
  materials.ts · labels.ts     Materiales compartidos (un dueño, se liberan juntos) y etiquetas en canvas
  layout.ts · framing.ts       Medidas, bolsillos/abanico y encuadre de cámara: puro, con tests
```

## Decisiones

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

## Fondo fotográfico

La referencia tiene de fondo una foto de una habitación cálida desenfocada (planta,
bowl, luces). No hay una imagen así con derechos de uso en el repo, así que el fondo se
arma con CSS (`OrganizerBackdrop.module.css`). Para usar una foto:

1. Guardarla en `public/assets/organizer/backdrop.webp` (≥ 2400×1350, < 400 KB, sin
   objetos en el tercio central-izquierdo donde va la carpeta).
2. En `OrganizerBackdrop.tsx`: `const BACKDROP_PHOTO = "/assets/organizer/backdrop.webp";`
3. Para el tema oscuro, una variante `backdrop-dark.webp` (o bajar su brillo con CSS).

## Assets

`public/assets/organizer/textures/`: `leather_{normal,roughness}.png`,
`plastic_normal.png`, `paper_basecolor.png` (512×512, originales del starter
`aurora-organizer-3d`, ver su `docs/ASSETS.md`).
