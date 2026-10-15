import { reportError } from "@/core/logger";
import type { DialogOptions } from "@/types";

/**
 * Diálogo de confirmación imperativo: `showDialog({ title, message, onConfirm })`.
 * Lo inicializa `<GlobalConfirmDialog />`, montado en los providers.
 */
let showDialogFn: ((options: DialogOptions) => void) | null = null;
let closeDialogFn: (() => void) | null = null;

export const initializeDialog = (
  showFn: (options: DialogOptions) => void,
  closeFn: () => void,
) => {
  showDialogFn = showFn;
  closeDialogFn = closeFn;
};

const notMounted = () =>
  reportError(new Error("GlobalConfirmDialog no está montado en los providers."), {
    context: "dialogService",
  });

export const showDialog = (options: DialogOptions) => {
  if (!showDialogFn) return notMounted();
  showDialogFn(options);
};

export const closeDialog = () => {
  if (!closeDialogFn) return notMounted();
  closeDialogFn();
};
