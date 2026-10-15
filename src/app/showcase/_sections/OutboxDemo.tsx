"use client";

import { useEffect, useState } from "react";
import { CloudOff, Plus, ServerCrash, ShieldX, Trash2 } from "lucide-react";

import { OutboxStatusPanel } from "@/components/feedback/OutboxStatusPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { alertService } from "@/core/alert";
import { createSyncRuntime, defineEntity } from "@/core/sync";

import { showcaseApi, type DemoNote as Note, type DemoServerMode as ServerMode } from "../_data/showcaseApi";

/**
 * Motor propio de la demo: su registro y su base de IndexedDB, separados de
 * los del proyecto (`core/sync/registry.ts` sigue vacío). La identidad es fija
 * porque la plantilla no tiene login real; en tu app se usa la sesión.
 */
const demoSync = createSyncRuntime({
  databaseName: "showcase_sync",
  schemaVersion: 1,
  registry: {
    Note: defineEntity<{ text: string; done: boolean }>({ endpoint: "/api/showcase/notes", versionField: "version" }),
  },
  identity: { currentUserId: async () => "demo", onSignIn: () => () => undefined },
  config: { baseDelayMs: 2_000, maxDelayMs: 20_000, pollIntervalMs: 5_000 },
});

const MODE_LABEL: Record<ServerMode, string> = { ok: "Responde bien", down: "Caído (5xx)", reject: "Rechaza (422)" };

export default function OutboxDemo() {
  const [text, setText] = useState("");
  const [serverNotes, setServerNotes] = useState<Note[]>([]);
  const [mode, setMode] = useState<ServerMode>("ok");

  useEffect(() => {
    // Lo que ya está en el servidor. Se relee cada vez que el motor confirma algo.
    const loadServerNotes = () =>
      showcaseApi
        .notes()
        .then(setServerNotes)
        .catch(() => undefined); // sin red la lista se queda como estaba; el panel ya avisa

    demoSync.start();
    loadServerNotes();
    showcaseApi
      .serverMode()
      .then((response) => setMode(response.mode))
      .catch(() => undefined);
    return demoSync.getEngine().subscribe(loadServerNotes);
  }, []);

  const changeMode = async (next: ServerMode) => {
    setMode(next);
    await showcaseApi.setServerMode(next);
    if (next === "ok") void demoSync.getEngine().retryNow();
  };

  // En un feature real esto vive en `repositories/` y lo llama un service.
  const enqueue = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      alertService.reportError("Notas", error);
    }
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Outbox: guardar sin conexión</CardTitle>
          <CardDescription>
            Cada cambio se guarda primero en IndexedDB y se manda en segundo plano, en orden y con
            reintentos. Prueba: desconéctate (DevTools → Network → Offline) o pon el servidor
            &quot;caído&quot;, agrega notas, y vuelve a conectar. Con &quot;Rechaza&quot; las notas quedan
            bloqueadas sin perderse, y se reintentan desde el panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Servidor de demo:</span>
            <Tabs value={mode} onValueChange={(value) => void changeMode(value as ServerMode)}>
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger value="ok">{MODE_LABEL.ok}</TabsTrigger>
                <TabsTrigger value="down"><ServerCrash /> {MODE_LABEL.down}</TabsTrigger>
                <TabsTrigger value="reject"><ShieldX /> {MODE_LABEL.reject}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const value = text.trim();
              if (!value) return;
              setText("");
              void enqueue(() => demoSync.outbox.create("Note", { text: value, done: false }));
            }}
          >
            <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Escribe una nota…" maxLength={200} />
            <Button type="submit">
              <Plus /> Agregar
            </Button>
          </form>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">
              En el servidor <span className="tabular-nums text-muted-foreground">({serverNotes.length})</span>
            </p>
            {serverNotes.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CloudOff className="size-4" /> Todavía no llega ninguna nota.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {serverNotes.map((note) => (
                  <li key={note.id} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox
                      checked={note.done}
                      aria-label={`Marcar "${note.text}"`}
                      onCheckedChange={(checked) =>
                        void enqueue(() => demoSync.outbox.update("Note", { id: note.id, done: checked === true }))
                      }
                    />
                    <span className={note.done ? "flex-1 text-muted-foreground line-through" : "flex-1"}>{note.text}</span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">v{note.version}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Borrar "${note.text}"`}
                      onClick={() => void enqueue(() => demoSync.outbox.delete("Note", note.id))}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <OutboxStatusPanel engine={demoSync.getEngine()} title="Cola de la demo" />
    </div>
  );
}
