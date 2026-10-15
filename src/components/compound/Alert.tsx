"use client";

import { JSX, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface Props {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description?: string | JSX.Element | JSX.Element[];
  confirmText?: string;
  showFooter?: boolean;
  index?: number;
  closeOnOverlayClick?: boolean;
  colorSchema?: string;
  applyProgress?: boolean;
}

const AlertDialogComponent = ({
  isOpen = false,
  onCancel,
  onConfirm,
  title,
  description,
  confirmText,
  showFooter = true,
  colorSchema = "red",
  applyProgress = false,
}: Props) => {
  const [progressValue, setProgressValue] = useState(100);

  useEffect(() => {
    if (!applyProgress) return;
    const timer = setInterval(() => {
      setProgressValue((prevValue) => {
        if (prevValue > 0) {
          return prevValue - 1;
        } else {
          clearInterval(timer);
          return 0;
        }
      });
    }, 100);

    return () => clearInterval(timer);
  }, [applyProgress]);

  return (
    <AlertDialog open={isOpen} onOpenChange={onCancel}>
      <AlertDialogContent className="sm:max-w-lg bg-card dark:bg-neutral-900 rounded-lg shadow-lg z-[9999]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold">
            {title}
          </AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {showFooter && (
          <AlertDialogFooter className="flex gap-2 mt-4">
            <AlertDialogCancel asChild>
              <Button variant="ghost" onClick={onCancel}>
                Cancelar
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={onConfirm}
                className={
                  colorSchema === "red"
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }
              >
                {confirmText ?? "Borrar"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        )}

        {applyProgress && (
          <div className="w-full h-2 bg-muted rounded mt-4 overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-100"
              style={{ width: `${progressValue}%` }}
            />
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default AlertDialogComponent;
