export interface SelectOption {
  label: string;
  text?: string;
  value: string | number;
}

export type DialogType = "info" | "warning" | "error" | "success" | "question";

export interface DialogOptions {
  title?: string;
  message?: string;
  type?: "info" | "warning" | "error" | "success" | "question";
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}
