import { Send } from "lucide-react";
import { useRef, useState, KeyboardEvent, ChangeEvent } from "react";

interface PropsToken {
  setTokenInput: (e: string) => void;
  handleTokenSubmit: () => void;
  loaderBtn: boolean;
}

const PinInputCustom = ({
  setTokenInput,
  handleTokenSubmit,
  loaderBtn,
}: PropsToken) => {
  const [pins, setPins] = useState<string[]>(Array(6).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Solo permitir números
    if (value && !/^\d$/.test(value)) return;

    const newPins = [...pins];
    newPins[index] = value;
    setPins(newPins);

    // Actualizar el token completo
    setTokenInput(newPins.join(""));

    // Auto-focus al siguiente input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Backspace: borrar y volver al anterior
    if (e.key === "Backspace") {
      e.preventDefault();
      const newPins = [...pins];

      if (pins[index]) {
        // Si hay valor, borrarlo
        newPins[index] = "";
        setPins(newPins);
        setTokenInput(newPins.join(""));
      } else if (index > 0) {
        // Si no hay valor, ir al anterior y borrarlo
        newPins[index - 1] = "";
        setPins(newPins);
        setTokenInput(newPins.join(""));
        inputRefs.current[index - 1]?.focus();
      }
    }

    // Enter en el último input: enviar
    if (e.key === "Enter" && index === 5 && pins[5]) {
      handleTokenSubmit();
    }

    // Flecha izquierda
    if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    // Flecha derecha
    if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text");
    const digits = pastedData.replace(/\D/g, "").slice(0, 6);

    const newPins = Array(6).fill("");
    digits.split("").forEach((digit, index) => {
      newPins[index] = digit;
    });

    setPins(newPins);
    setTokenInput(newPins.join(""));

    // Focus en el siguiente input vacío o el último
    const nextEmptyIndex = newPins.findIndex((pin) => !pin);
    const focusIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
    inputRefs.current[focusIndex]?.focus();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* PIN INPUT */}
      <div className="flex gap-2 m-5" onPaste={handlePaste}>
        {pins.map((pin, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={pin}
            className="w-12 h-14 text-center text-lg font-semibold border-2 border-gray-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            onChange={(e) => handleChange(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            autoFocus={i === 0}
          />
        ))}
      </div>

      {/* SUBMIT BUTTON */}
      <button
        onClick={handleTokenSubmit}
        disabled={loaderBtn}
        className="min-w-[120px] px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed text-white font-medium rounded-md flex items-center justify-center gap-2 transition-colors"
      >
        {loaderBtn ? (
          <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
        ) : (
          <>
            ENVIAR <Send className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
};

export default PinInputCustom;
