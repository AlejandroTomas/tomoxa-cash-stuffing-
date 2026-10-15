"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clearSession } from "@/core/session";

/**
 * Cierra la sesión local y manda al login. Si tu backend usa cookie `httpOnly`,
 * aquí también se llama a su endpoint de logout (desde un service).
 */
const LogOutBtn = ({ iconOnly = false }: { iconOnly?: boolean }) => {
  const router = useRouter();

  const logOut = () => {
    clearSession();
    router.push("/login");
  };

  return iconOnly ? (
    <Button
      variant="ghost"
      size="icon"
      onClick={logOut}
      aria-label="Cerrar sesión"
      className="size-8 text-sidebar-foreground/60 hover:text-destructive"
    >
      <LogOut className="size-4" />
    </Button>
  ) : (
    <Button variant="outline" className="text-destructive" onClick={logOut}>
      <LogOut /> Salir
    </Button>
  );
};

export default LogOutBtn;
