import type { CSSProperties } from "react";
import styles from "./OrganizerBackdrop.module.css";

/**
 * Foto opcional para el fondo (habitación desenfocada). Mientras no exista, el
 * fondo se arma solo con CSS. Ver README del feature: "Fondo fotográfico".
 */
const BACKDROP_PHOTO: string | null = null;

const BOKEH = [
  { left: "58%", top: "6%", size: 120 },
  { left: "70%", top: "14%", size: 70 },
  { left: "82%", top: "4%", size: 160 },
  { left: "88%", top: "30%", size: 90 },
  { left: "64%", top: "26%", size: 50 },
  { left: "6%", top: "52%", size: 80 },
  { left: "14%", top: "70%", size: 46 },
  { left: "46%", top: "3%", size: 60 },
];

/** Fondo de la escena (decorativo). */
export function OrganizerBackdrop() {
  const style = BACKDROP_PHOTO ? ({ "--backdrop-photo": `url(${BACKDROP_PHOTO})` } as CSSProperties) : undefined;
  return (
    <div aria-hidden="true" className={styles.backdrop} style={style}>
      {!BACKDROP_PHOTO && (
        <>
          <div className={styles.plant} />
          <div className={styles.bowl} />
          {BOKEH.map((b) => (
            <span key={`${b.left}-${b.top}`} className={styles.bokeh} style={{ left: b.left, top: b.top, width: b.size, height: b.size }} />
          ))}
        </>
      )}
    </div>
  );
}
