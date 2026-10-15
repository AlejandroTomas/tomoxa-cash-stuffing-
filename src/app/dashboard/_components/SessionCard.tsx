"use client";

import Link from "next/link";
import { LogIn, UserRound } from "lucide-react";

import LogOutBtn from "@/components/auth/LogOutBtn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/hooks/useSession";

/** Quién tiene la sesión en este equipo (core/session). */
export function SessionCard() {
  const session = useSession();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-4 text-muted-foreground" /> Sesión
        </CardTitle>
        <CardDescription>
          Leída de <code className="font-mono">core/session</code> con el hook{" "}
          <code className="font-mono">useSession</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {session ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Usuario</dt>
              <dd className="font-medium">{session.fullName ?? session.username}</dd>
              <dt className="text-muted-foreground">Rol</dt>
              <dd>{session.role}</dd>
            </dl>
            <LogOutBtn />
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">No hay sesión iniciada.</p>
            <Button asChild>
              <Link href="/login">
                <LogIn /> Iniciar sesión
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
