"use client";

import Link from "next/link";
import { AlertTriangle, Landmark, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useIsClient } from "@/hooks/useIsClient";
import { cn } from "@/lib/utils";
import { AuroraMark } from "./AuroraMark";

const LINKS = [
  { label: "Inicio", href: "/" },
  { label: "Organizer", href: "/organizer" },
] as const;

interface OrganizerNavProps {
  onAccounts?: () => void;
  /** Aviso corto junto a "Cuentas" (deuda sin respaldo, sobres sobregirados). */
  alert?: string | null;
}

/** Barra superior de vidrio: marca, secciones, cuentas, tema y perfil (demo). */
export function OrganizerNav({ onAccounts, alert }: OrganizerNavProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsClient();
  const dark = mounted && resolvedTheme === "dark";

  const themeButton = "grid size-10 place-items-center rounded-full text-foreground/70 transition-colors hover:bg-card/70 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none aria-pressed:text-foreground";

  return (
    <header className="px-3 pt-3 lg:p-0">
      <nav
        aria-label="Principal"
        className="flex h-16 items-center gap-4 rounded-full border border-card/60 bg-card/55 pr-3 pl-5 shadow-lg shadow-foreground/5 backdrop-blur-xl lg:h-[4.5rem] lg:gap-10 lg:pr-4 lg:pl-8"
      >
        <Link href="/" className="flex shrink-0 items-center gap-3 rounded-full text-lg font-medium tracking-tight text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:text-[1.65rem]">
          <AuroraMark className="size-7 lg:size-9" />
          <span>
            Aurora<span className="hidden sm:inline"> Organizer</span>
          </span>
        </Link>
        <ul className="hidden items-center gap-12 text-[0.95rem] text-foreground/80 xl:flex">
          {LINKS.map((link, index) => (
            <li key={link.label}>
              <Link
                href={link.href}
                aria-current={index === 0 ? "page" : undefined}
                className="rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-[current=page]:text-foreground"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1 lg:gap-3">
          {onAccounts && (
            <button
              type="button"
              onClick={onAccounts}
              aria-label={alert ? `Cuentas. Aviso: ${alert}` : undefined}
              className="mr-1 flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-foreground/80 outline-none transition-colors hover:bg-card/70 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:mr-2"
            >
              <Landmark className="size-5" aria-hidden="true" />
              <span className="hidden sm:inline">Cuentas</span>
              {alert && (
                <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  <span className="hidden md:inline">{alert}</span>
                </span>
              )}
            </button>
          )}
          <button type="button" aria-label="Tema claro" aria-pressed={mounted ? !dark : undefined} onClick={() => setTheme("light")} className={themeButton}>
            <Sun className="size-5" />
          </button>
          <button type="button" aria-label="Tema oscuro" aria-pressed={mounted ? dark : undefined} onClick={() => setTheme("dark")} className={themeButton}>
            <Moon className={cn("size-5", "fill-current")} />
          </button>
          <span role="img" aria-label="Perfil (demo)" className="ml-2 hidden size-10 rounded-full sm:block bg-primary/85 ring-4 ring-card/70 lg:size-12" />
        </div>
      </nav>
    </header>
  );
}
