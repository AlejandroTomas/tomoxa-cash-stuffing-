import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  X,
  Check,
} from "lucide-react";
import { DialogType } from "@/types";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  confirmColorScheme?: string;
  cancelColorScheme?: string;
  showCancelButton?: boolean;
  showConfirmButton?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
}

// ==================== DEFAULT DATA ====================
const DEFAULT_PROPS = {
  title: "Confirm Action",
  message: "Are you sure you want to perform this action?",
  type: "question" as DialogType,
  confirmText: "Confirm",
  cancelText: "Cancel",
  confirmColorScheme: "primary",
  cancelColorScheme: "gray",
  showCancelButton: true,
  showConfirmButton: true,
  size: "md" as const,
  closeOnOverlayClick: true,
  closeOnEsc: true,
};

// ==================== HELPER FUNCTIONS ====================
// Mapa estático: un componente elegido de aquí no se "crea" durante el render.
const DIALOG_ICONS = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle,
  question: AlertCircle,
} as const;

/** Color del icono por tipo, con los tokens de estado (se ven en ambos temas). */
const getDialogStyles = (type: DialogType) => {
  switch (type) {
    case "info":
      return { iconColor: "text-info", bgColor: "bg-info/15" };
    case "warning":
    case "question":
      return { iconColor: "text-warning", bgColor: "bg-warning/15" };
    case "error":
      return { iconColor: "text-destructive", bgColor: "bg-destructive/15" };
    case "success":
      return { iconColor: "text-success", bgColor: "bg-success/15" };
    default:
      return { iconColor: "text-muted-foreground", bgColor: "bg-muted" };
  }
};

const sizeMap = {
  xs: "384px",
  sm: "448px",
  md: "512px",
  lg: "576px",
  xl: "672px",
  "2xl": "768px",
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = DEFAULT_PROPS.title,
  message = DEFAULT_PROPS.message,
  type = DEFAULT_PROPS.type,
  confirmText = DEFAULT_PROPS.confirmText,
  cancelText = DEFAULT_PROPS.cancelText,
  confirmColorScheme = DEFAULT_PROPS.confirmColorScheme,
  showCancelButton = DEFAULT_PROPS.showCancelButton,
  showConfirmButton = DEFAULT_PROPS.showConfirmButton,
  size = DEFAULT_PROPS.size,
  closeOnOverlayClick = DEFAULT_PROPS.closeOnOverlayClick,
  closeOnEsc = DEFAULT_PROPS.closeOnEsc,
}) => {
  const IconComponent = DIALOG_ICONS[type] ?? Info;
  const styles = getDialogStyles(type);

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && closeOnOverlayClick) {
      onClose();
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-1300 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          style={{ width: sizeMap[size] }}
          className="fixed left-1/2 top-1/2 z-1300 max-h-[90vh] w-full -translate-x-1/2 -translate-y-1/2 flex flex-col gap-4 border border-border bg-card p-6 shadow-2xl rounded-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
          onEscapeKeyDown={(e) => {
            if (!closeOnEsc) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            if (!closeOnOverlayClick) {
              e.preventDefault();
            }
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            <div
              className={`${styles.bgColor} p-2 rounded-full flex items-center justify-center`}
            >
              <IconComponent className={`h-6 w-6 ${styles.iconColor}`} />
            </div>
            <Dialog.Title className="text-xl font-semibold text-foreground flex-1">
              {title}
            </Dialog.Title>
          </div>

          {/* Body */}
          <Dialog.Description className="text-muted-foreground leading-relaxed">
            {message}
          </Dialog.Description>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            {showCancelButton && (
              <Button variant="ghost" onClick={onClose} className="gap-2">
                <X className="h-4 w-4" />
                {cancelText}
              </Button>
            )}
            {showConfirmButton && (
              <Button
                onClick={handleConfirm}
                variant={confirmColorScheme === "destructive" ? "destructive" : "default"}
                className="gap-2"
              >
                <Check className="h-4 w-4" />
                {confirmText}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
