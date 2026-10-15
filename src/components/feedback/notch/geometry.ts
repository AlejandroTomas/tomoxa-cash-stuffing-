/**
 * Portable geometry extracted from the project's custom Sileo notch.
 * Coordinates are CSS pixels. Supply positive width/height.
 * For bottom placement, reflect only the SVG canvas with scaleY(-1).
 */
export function notchPath(
  left: number,
  width: number,
  height: number,
  roundness = 22
): string {
  const right = left + width;
  const shoulder = Math.min(14, height / 3);
  const radius = Math.min(roundness, height - shoulder, width / 2);
  const k = 0.5522847498;

  // Keep these commands identical between states for numeric interpolation.
  return [
    `M ${left - shoulder} 0`,
    `H ${right + shoulder}`,
    `C ${right + shoulder * (1 - k)} 0 ${right} ${
      shoulder * (1 - k)
    } ${right} ${shoulder}`,
    `V ${height - radius}`,
    `C ${right} ${height - radius * (1 - k)} ${
      right - radius * (1 - k)
    } ${height} ${right - radius} ${height}`,
    `H ${left + radius}`,
    `C ${left + radius * (1 - k)} ${height} ${left} ${
      height - radius * (1 - k)
    } ${left} ${height - radius}`,
    `V ${shoulder}`,
    `C ${left} ${shoulder * (1 - k)} ${left - shoulder * (1 - k)} 0 ${
      left - shoulder
    } 0 Z`,
  ].join(" ");
}

/** Motion/Framer Motion format: duration is in seconds. */
export const notchSpring = {
  type: "spring" as const,
  bounce: 0.25,
  duration: 0.6,
};
