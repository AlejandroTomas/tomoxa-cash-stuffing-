import { useCallback, useState } from "react";

import { alertService } from "@/core/alert";

const useAsyncPromise = (componentName: string) => {
  const [loadingCount, setLoadingCount] = useState<number>(0); // Contador de cargas activas

  const setLoading = (isLoading: boolean) => {
    setLoadingCount((prev) => prev + (isLoading ? 1 : -1));
  };

  const wrapperFunction = useCallback(
    async <Args extends unknown[]>(
      asyncFunction: (...args: Args) => Promise<void>,
      ...args: Args
    ) => {
      setLoading(true);
      try {
        await asyncFunction(...args);
      } catch (error) {
        // Registra el detalle técnico y muestra solo el mensaje seguro.
        alertService.reportError("Error", error, componentName);
      } finally {
        setLoading(false);
      }
    },
    [componentName],
  );

  return {
    isLoading: loadingCount > 0, // `loading` está activo si hay al menos una carga en progreso
    wrapperFunction,
  };
};

export default useAsyncPromise;
