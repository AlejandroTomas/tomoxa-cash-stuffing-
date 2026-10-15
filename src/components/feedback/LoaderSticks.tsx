"use client";

import React from "react";

interface Props {
  size?: number;
}

const LoaderSticks = ({ size = 50 }: Props) => {
  const blades = Array.from({ length: 12 }, (_, i) => {
    const delay = i * 0.08;
    const rotation = i * 30;

    return (
      <span
        key={i}
        className="absolute left-[0.4629em] bottom-0 w-[0.074em] h-[0.2777em] rounded-[0.0555em] bg-muted-foreground dark:bg-white"
        style={{
          transformOrigin: "center -0.2222em",
          transform: `rotate(${rotation}deg)`,
          animation: `fade 1s infinite linear`,
          animationDelay: `${delay}s`,
        }}
      />
    );
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inline-block"
        style={{
          fontSize: "28px",
          width: "1em",
          height: "1em",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          margin: "auto",
        }}
      >
        {blades}
      </div>
      <style jsx>{`
        @keyframes fade {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default LoaderSticks;
