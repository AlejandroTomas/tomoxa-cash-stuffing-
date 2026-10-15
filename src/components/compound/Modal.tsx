"use client";

import { JSX } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface MinimalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Props extends MinimalProps {
  onSubmit?: (() => void) | JSX.Element;
  children: React.ReactNode;
  title: string | JSX.Element;
  cancelButton?: boolean;
  cancelButtonText?: string;
  onSubmitButtonText?: string;
  actionColor?: string;
  isDisabled?: boolean;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "full";
}

export default function Modal({
  isOpen = false,
  onClose,
  onSubmit,
  title,
  children,
  onSubmitButtonText,
  isDisabled,
  actionColor,
  cancelButtonText,
  cancelButton = true,
  size = "lg",
}: Props) {
  const widthMap = {
    sm: "384px",
    md: "448px",
    lg: "512px",
    xl: "576px",
    "2xl": "672px",
    "3xl": "768px",
    "4xl": "896px",
    "5xl": "1024px",
    full: "95vw",
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          style={{ width: widthMap[size] }}
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full -translate-x-1/2 -translate-y-1/2 flex flex-col gap-4 border border-border bg-card p-6 shadow-2xl rounded-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
          aria-describedby="modal-description"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border pb-4">
            <Dialog.Title className="text-2xl font-bold text-foreground pr-8">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-muted rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          {/* Content con scroll */}
          <div className="overflow-y-auto flex-1 pr-2">{children}</div>

          {/* Footer */}
          {(cancelButton || onSubmit !== undefined) && (
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              {cancelButton && (
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="hover:bg-muted"
                >
                  {cancelButtonText ?? "Cancelar"}
                </Button>
              )}
              {onSubmit !== undefined &&
                (typeof onSubmit === "function" ? (
                  <Button
                    onClick={onSubmit}
                    disabled={isDisabled}
                    className={
                      actionColor === "red"
                        ? "bg-red-600 hover:bg-red-700 text-white"
                        : actionColor === "green"
                        ? "bg-green-600 hover:bg-green-700 text-white"
                        : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                    }
                  >
                    {onSubmitButtonText ?? "Guardar"}
                  </Button>
                ) : (
                  onSubmit
                ))}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
