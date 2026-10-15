"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";

const Countdown = ({
  timeLeft,
  setTimeLeft,
  token,
}: {
  token: string | null;
  timeLeft: number;
  setTimeLeft: Dispatch<SetStateAction<number>>;
}) => {
  useEffect(() => {
    if (!token) return;
    const intervalId = setInterval(() => {
      setTimeLeft((prevTimeLeft: number) => {
        if (prevTimeLeft <= 0) {
          clearInterval(intervalId);
          return 0;
        }
        return prevTimeLeft - 1000;
      });
    }, 1000);
    return () => clearInterval(intervalId);
  }, [token, setTimeLeft]);

  const minutes = Math.floor((timeLeft / (1000 * 60)) % 60);
  const seconds = Math.floor((timeLeft / 1000) % 60);

  if (!token) return null;

  return (
    <div className="flex justify-center">
      <div className="text-center">
        <div className="font-bold text-sm">Tiempo Restante</div>
        <div className="text-xl font-semibold">
          0{minutes}:{seconds.toString().length === 1 ? `0${seconds}` : seconds}
        </div>
        <div className="text-xs text-muted-foreground">Token generado</div>
      </div>
    </div>
  );
};

export default Countdown;
