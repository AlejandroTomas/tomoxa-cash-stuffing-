import Link from "next/link";
import {
  ArrowUpRight,
  Blocks,
  CloudOff,
  FileSpreadsheet,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  LogIn,
  ShieldCheck,
  Sparkles,
  Table2,
  type LucideIcon,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { publicEnv } from "@/core/env";
import { ApiStatus } from "./_home/ApiStatus";

/**
 * Bienvenida de la plantilla (como la de create-next-app). Reemplázala por la
 * página de inicio del proyecto.
 */
const STEPS = [
  { text: "Lee", code: "AGENTS.md", after: "y decide qué módulos se quedan." },
  { text: "Copia", code: ".env.example → .env.local", after: "y ajusta las variables." },
  { text: "Crea tu primer feature copiando", code: "src/features/_example", after: "." },
  { text: "Antes de cada commit:", code: "pnpm verify", after: "" },
];

const LINKS: Array<{ href: string; title: string; description: string; icon: LucideIcon }> = [
  { href: "/showcase", title: "Showcase", description: "Cada pieza de la plantilla funcionando: tabla, alertas, Excel, outbox…", icon: LayoutGrid },
  { href: "/example", title: "Feature de ejemplo", description: "Un módulo con todas las capas, listo para copiar.", icon: ListChecks },
  { href: "/dashboard", title: "Dashboard", description: "Layout con menú lateral, KPIs y la sesión actual.", icon: LayoutDashboard },
  { href: "/login", title: "Login", description: "react-hook-form + Zod, con el mismo esquema en cliente y servidor.", icon: LogIn },
];

const FEATURES: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Arquitectura por capas", icon: Blocks },
  { label: "Errores tipados de punta a punta", icon: ShieldCheck },
  { label: "Toasts y alertas notch", icon: Sparkles },
  { label: "Tabla con filtros", icon: Table2 },
  { label: "Importar Excel", icon: FileSpreadsheet },
  { label: "Outbox sin conexión", icon: CloudOff },
];

export default function HomePage() {
  const appName = publicEnv.NEXT_PUBLIC_APP_NAME;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">
            {appName.charAt(0).toUpperCase()}
          </span>
          {appName}
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-6 py-12 sm:py-20">
        <section className="space-y-6">
          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Aurora Template</h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Next.js 16 con arquitectura por capas, shadcn/ui y las piezas que se repiten en cada
              sistema. Borra lo que no uses; lo que no se negocia es la arquitectura y el sistema de diseño.
            </p>
          </div>

          <ol className="space-y-2 font-mono text-sm">
            {STEPS.map((step, index) => (
              <li key={step.code} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-muted-foreground">{index + 1}.</span>
                <span className="font-sans text-foreground">{step.text}</span>
                <code className="rounded-md bg-muted px-1.5 py-0.5 font-semibold text-foreground">{step.code}</code>
                {step.after && <span className="font-sans text-muted-foreground">{step.after}</span>}
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="Rutas de ejemplo" className="grid gap-4 sm:grid-cols-2">
          {LINKS.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-foreground">
                  <Icon className="size-4 text-muted-foreground" /> {title}
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </Link>
          ))}
        </section>

        <section aria-label="Qué incluye" className="flex flex-wrap gap-2">
          {FEATURES.map(({ label, icon: Icon }) => (
            <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">
              <Icon className="size-3.5" /> {label}
            </span>
          ))}
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4 text-sm text-muted-foreground">
        <ApiStatus />
        <span>Next.js 16 · React 19 · Tailwind v4 · shadcn/ui</span>
      </footer>
    </div>
  );
}
