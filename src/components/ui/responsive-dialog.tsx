"use client";

import * as React from "react";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

/**
 * Credenza: diálogo RESPONSIVO. En computadora (≥1024px) es un Dialog centrado de
 * Radix; en tablet/teléfono es un Drawer (bottom sheet, vaul). Refleja el API de
 * shadcn Dialog (mismos sub-componentes), así migrar un `Dialog*` existente es
 * cambiar el import y el prefijo por `Credenza*`.
 */
const DesktopContext = React.createContext(true);
const useCredenza = () => React.useContext(DesktopContext);

interface RootProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

function Credenza({ children, ...props }: RootProps) {
  const isDesktop = useIsDesktop();
  const Root = isDesktop ? Dialog : Drawer;
  return (
    <DesktopContext.Provider value={isDesktop}>
      <Root {...props}>{children}</Root>
    </DesktopContext.Provider>
  );
}

function CredenzaTrigger(
  props: React.ComponentProps<typeof DialogTrigger>,
) {
  const isDesktop = useCredenza();
  const Cmp = isDesktop ? DialogTrigger : DrawerTrigger;
  return <Cmp {...props} />;
}

function CredenzaClose(props: React.ComponentProps<typeof DialogClose>) {
  const isDesktop = useCredenza();
  const Cmp = isDesktop ? DialogClose : DrawerClose;
  return <Cmp {...props} />;
}

function CredenzaContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  const isDesktop = useCredenza();
  if (isDesktop) {
    return (
      <DialogContent className={className} {...props}>
        {children}
      </DialogContent>
    );
  }
  // Móvil: el contenido llena la altura que controla el DrawerContent (vaul la
  // reduce cuando aparece el TECLADO). Usar flex-1 + min-h-0 —no un max-h fijo— deja
  // que el área de scroll encoja sobre el teclado y el input enfocado quede visible.
  return (
    <DrawerContent {...props}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-4">
        {children}
      </div>
    </DrawerContent>
  );
}

function CredenzaHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isDesktop = useCredenza();
  const Cmp = isDesktop ? DialogHeader : DrawerHeader;
  return <Cmp className={cn(!isDesktop && "px-0", className)} {...props} />;
}

function CredenzaFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isDesktop = useCredenza();
  const Cmp = isDesktop ? DialogFooter : DrawerFooter;
  // En el sheet el pie va en fila y alineado a la derecha —igual que en el
  // Dialog— para que la acción principal quede junto a "Cancelar" y no apilada.
  return (
    <Cmp
      className={cn(
        !isDesktop && "flex-row flex-wrap justify-end gap-2 px-0 pt-4",
        className,
      )}
      {...props}
    />
  );
}

function CredenzaTitle(
  props: React.ComponentProps<typeof DialogTitle>,
) {
  const isDesktop = useCredenza();
  const Cmp = isDesktop ? DialogTitle : DrawerTitle;
  return <Cmp {...props} />;
}

function CredenzaDescription(
  props: React.ComponentProps<typeof DialogDescription>,
) {
  const isDesktop = useCredenza();
  const Cmp = isDesktop ? DialogDescription : DrawerDescription;
  return <Cmp {...props} />;
}

export {
  Credenza,
  CredenzaTrigger,
  CredenzaClose,
  CredenzaContent,
  CredenzaHeader,
  CredenzaFooter,
  CredenzaTitle,
  CredenzaDescription,
};
