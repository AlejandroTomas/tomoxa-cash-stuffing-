import { useId } from "react";

/**
 * Marca de Ahorroxa (la misma que `app/icon.svg`): billetes que asoman de
 * un sobre cerrado con el sello de Tomoxa (la T). A color, igual en ambos temas.
 */
export function AhorroxaMark({ className }: { className?: string }) {
  // Ids propios: puede haber más de una marca en la página.
  const id = useId();
  const bg = `${id}-bg`;
  const pocket = `${id}-pocket`;
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F7A48F" />
          <stop offset="1" stopColor="#DE5F6A" />
        </linearGradient>
        <linearGradient id={pocket} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#FCEDE6" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${bg})`} />
      <g transform="rotate(-10 256 196)">
        <rect x="134" y="98" width="244" height="150" rx="24" fill="#FBD9A8" />
      </g>
      <g transform="rotate(7 256 196)">
        <rect x="140" y="120" width="236" height="140" rx="24" fill="#FFF4E4" />
        <path d="M176 160h52M176 186h34" stroke="#EBC79A" strokeWidth={12} strokeLinecap="round" />
      </g>
      <path d="M92 240a32 32 0 0 1 32-32h264a32 32 0 0 1 32 32v132a44 44 0 0 1-44 44H136a44 44 0 0 1-44-44z" fill={`url(#${pocket})`} />
      <path d="M108 226l148 92 148-92" fill="none" stroke="#F2B7AE" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="256" cy="318" r="50" fill="#DE5F6A" />
      <path d="M232 302h48M256 302v40" stroke="#FFFFFF" strokeWidth={15} strokeLinecap="round" />
    </svg>
  );
}
