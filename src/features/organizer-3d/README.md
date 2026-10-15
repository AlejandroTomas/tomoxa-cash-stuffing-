# organizer-3d — carpeta organizadora 3D (fase 01, solo visual)

Carpeta de cuero sintético con seis sobres plásticos extraíbles. Ruta: `/organizer`.
**Los importes son mock** (`mocks/envelopes.mock.ts`, única fuente) y nada aquí
mueve, guarda ni sincroniza dinero.

## Piezas

```
mocks/envelopes.mock.ts      Sobres de demostración (nombre, color, icono, importe ficticio)
domain/organizerView.ts      Máquina de estados visual: closed → open → focused ⇄ extracted
components/
  OrganizerExperience.tsx    Composición: escena + barra de acciones + panel HTML
  useOrganizerController.ts  Una acción a la vez; espera la animación; teclado (flechas, Escape)
  OrganizerCanvas.tsx        Monta/desmonta la escena (solo cliente, next/dynamic ssr:false)
  EnvelopePanel.tsx          Lista accesible + detalle: alternativa completa al canvas
scene/                       Three.js directo, sin React
  organizerScene.ts          API imperativa (open/close/focus/extract/returnEnvelope/clearFocus) y timelines GSAP
  stage.ts                   Renderer, luces, entorno procedural (RoomEnvironment), sombras
  binder.ts · envelope.ts    Geometría de la carpeta y de los sobres
  materials.ts · labels.ts   Materiales/texturas compartidos (un dueño, se liberan juntos) y etiquetas en canvas
  layout.ts · framing.ts     Medidas, bolsillos y encuadre de cámara: puro, con tests
```

No usa Redux ni `services/`: no hay datos remotos todavía. En la fase 2 la escena
recibirá un `EnvelopeViewModel[]` de solo lectura derivado del ledger; la escena
nunca tendrá permiso para modificar montos.

## Decisiones

- **Un solo `WebGLRenderer`**; React no re-renderiza la escena. GSAP anima la escena,
  Motion solo el HTML.
- **Encuadre calculado** (`framing.ts`): en pantallas anchas entra la carpeta abierta
  completa; en angostas se priorizan los sobres y la tapa asoma por la izquierda. El
  sobre extraído se acerca lo más que permite el frustum sin recortarse.
- **Enfocar no saca al sobre de su plano** (solo sube): si avanzara en Z atravesaría a
  los de enfrente. La extracción sí sale perpendicular, después de deslizarse hacia arriba.
- **Orden de transparencias** fijo por sobre (`setLayer`); el extraído se dibuja encima.
- **Sombras** con mapa solo mientras algo se mueve (y cada 8 cuadros en reposo); el render
  se pausa fuera de pantalla o con la pestaña oculta. Pixel ratio máx. 1.75.
- **Colores de los sobres** son datos (como series de gráfica): van en `style`, iguales en
  ambos temas. El resto de la UI usa tokens.
- Iconos de las etiquetas 3D: trazos de Lucide (ISC) dibujados en canvas.
- `prefers-reduced-motion`: duraciones en 0, sin flotación ni paralaje.
- Sin WebGL: el panel HTML sigue funcionando y la escena muestra un aviso.

## Assets

`public/assets/organizer/textures/`: `leather_{basecolor,normal,roughness}.png`,
`plastic_normal.png`, `paper_basecolor.png` (512×512, originales del starter
`aurora-organizer-3d`, ver su `docs/ASSETS.md`).
