"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface HandwrittenTextProps {
  text: string;
  className?: string;
}

/** Tiempo por letra y tope total: frases largas se escriben más rápido. */
const PER_LETTER = 0.045;
const MAX_DURATION = 1.2;

/**
 * Frase en caligrafía que "se escribe" letra por letra, como con pluma.
 * Al cambiar el texto se vuelve a escribir. El texto real va oculto para
 * lectores de pantalla; las letras animadas son decorativas. Con reduce-motion aparece completa.
 */
export function HandwrittenText({ text, className }: HandwrittenTextProps) {
  const reduceMotion = useReducedMotion();
  const letters = Array.from(text);
  const step = Math.min(PER_LETTER, MAX_DURATION / Math.max(letters.length, 1));

  return (
    <span className={cn("font-handwriting inline-block leading-tight", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" key={text}>
        {letters.map((letter, index) =>
          reduceMotion ? (
            <span key={index}>{letter}</span>
          ) : (
            <motion.span
              key={index}
              className="inline-block whitespace-pre"
              initial={{ opacity: 0, y: 3, x: -2, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, x: 0, filter: "blur(0px)" }}
              transition={{ delay: index * step, duration: step * 3, ease: "easeOut" }}
            >
              {letter}
            </motion.span>
          ),
        )}
      </span>
    </span>
  );
}
