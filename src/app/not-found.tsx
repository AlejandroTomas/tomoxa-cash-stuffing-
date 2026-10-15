import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SearchX className="size-6" />
        </div>
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-xl font-bold text-foreground">No encontramos esta página</h1>
        <p className="text-sm text-muted-foreground">Puede que el enlace esté mal escrito o que la página ya no exista.</p>
        <Button asChild>
          <Link href="/">Ir al inicio</Link>
        </Button>
      </div>
    </main>
  );
}
