/** Marca de Aurora: una "A" de trazo con un barrido (original, no de terceros). */
export function AuroraMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M5 28 16 4l11 24" />
      <path d="M11.5 16.5 16 4" opacity={0.5} />
      <path d="M3 21c6-3.5 15-4.5 26-2" />
    </svg>
  );
}
