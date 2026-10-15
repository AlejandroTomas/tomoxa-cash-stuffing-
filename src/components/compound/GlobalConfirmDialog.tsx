"use client";

import { initializeDialog } from "@/utils/dialogService";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { DialogOptions } from "@/types";

export const GlobalConfirmDialog = () => {
  const [options, setOptions] = useState<DialogOptions | null>(null);

  const handleClose = () => {
    options?.onCancel?.();
    setOptions(null);
  };

  const handleConfirm = () => {
    options?.onConfirm?.();
    setOptions(null);
  };

  useEffect(() => {
    initializeDialog(
      (opts) => {
        setOptions(opts);
      },
      () => {
        setOptions(null);
      },
    );
  }, []);

  return (
    <ConfirmDialog
      isOpen={!!options}
      onClose={handleClose}
      onConfirm={handleConfirm}
      title={options?.title}
      message={options?.message}
      type={options?.type}
      confirmText={options?.confirmText}
      cancelText={options?.cancelText}
    />
  );
};
