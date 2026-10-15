"use client";

import { CloudOff, Loader2, RefreshCw, RotateCcw, UserCheck, Wifi } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { syncErrorMessage, type OutboxEngine, type OutboxEntry, type OutboxStatus } from "@/core/sync";
import { useOutboxSync } from "@/hooks/useOutboxSync";

const isDev = process.env.NODE_ENV === "development";

const STATUS_LABEL: Record<OutboxStatus, string> = {
  PENDING: "Pendiente",
  SYNCING: "Enviando",
  FAILED: "Reintentando",
  BLOCKED: "Requiere atención",
  DONE: "Sincronizado",
};

const STATUS_VARIANT: Record<OutboxStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  SYNCING: "outline",
  FAILED: "outline",
  BLOCKED: "destructive",
  DONE: "default",
};

const formatTime = (epochMs: number) =>
  new Date(epochMs).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

const isEnqueuedByOther = (entry: OutboxEntry, currentUserId: string | null) =>
  entry.enqueuedBy != null && entry.enqueuedBy !== currentUserId;

/**
 * Estado de la cola: lo que falta subir y lo que se atoró. Nada aquí borra
 * registros; lo bloqueado solo se puede volver a intentar. Al usuario se le
 * muestra un mensaje seguro; el detalle técnico solo en desarrollo.
 */
export function OutboxStatusPanel({ engine, title = "Sincronización" }: { engine?: OutboxEngine; title?: string }) {
  const { entries, pendingCount, blockedCount, isSyncing, isOnline, currentUserId, syncNow, retryBlocked, adoptEntries } =
    useOutboxSync(engine);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isOnline ? <Wifi className="size-4 text-muted-foreground" /> : <CloudOff className="size-4 text-destructive" />}
          {title}
        </CardTitle>
        <CardDescription className="tabular-nums">
          {isOnline ? "En línea" : "Sin conexión"} · {pendingCount} por subir · {blockedCount} requieren atención
        </CardDescription>
        <CardAction className="flex gap-2">
          {blockedCount > 0 && (
            <Button size="sm" variant="outline" onClick={() => retryBlocked()}>
              <RotateCcw /> Reintentar bloqueados
            </Button>
          )}
          <Button size="sm" onClick={syncNow} disabled={!isOnline || isSyncing}>
            {isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sincronizar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todo está sincronizado.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Registro</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Guardado</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead aria-label="Acciones" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const byOther = isEnqueuedByOther(entry, currentUserId);
                  return (
                    <TableRow key={entry.seq}>
                      <TableCell>
                        <p className="font-medium">{entry.entityName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{entry.entityId}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.operation}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {formatTime(entry.createdAt)}
                        {entry.enqueuedBy && <p>{entry.enqueuedBy}</p>}
                      </TableCell>
                      <TableCell className="max-w-80 whitespace-normal text-xs text-muted-foreground">
                        {byOther ? "Esperando a que entre el usuario que lo creó." : (syncErrorMessage(entry.lastErrorKind) ?? "—")}
                        {isDev && entry.lastError && (
                          <p className="mt-1 line-clamp-3 font-mono text-[11px] text-destructive/80">{entry.lastError}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {byOther && currentUserId && (
                          <Button size="sm" variant="outline" onClick={() => adoptEntries(entry.seq)}>
                            <UserCheck /> Enviar con mi sesión
                          </Button>
                        )}
                        {entry.status === "BLOCKED" && (
                          <Button size="sm" variant="outline" onClick={() => retryBlocked(entry.seq)}>
                            <RotateCcw /> Reintentar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
