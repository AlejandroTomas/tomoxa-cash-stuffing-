"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogIn } from "lucide-react";

import EyeToggle from "@/components/form/EyeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppDispatch } from "@/hooks/useReduxHooks";
import { rejectionFieldErrors, rejectionMessage } from "@/store/utils/thunkResult";
import { login } from "../actions/auth.actions";
import { loginSchema, type LoginDto } from "../dto/login.dto";

/**
 * Formulario con react-hook-form + Zod (el estándar de la plantilla): el
 * esquema valida en el cliente y es el mismo que valida el servidor.
 */
export function LoginForm({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginDto>({ resolver: zodResolver(loginSchema), defaultValues: { username: "", password: "" } });

  const onSubmit = async (dto: LoginDto) => {
    setFormError(undefined);
    try {
      await dispatch(login(dto)).unwrap();
      router.push(redirectTo);
    } catch (rejection) {
      // Errores por campo del servidor → al campo; el resto, arriba del botón.
      const fields = rejectionFieldErrors(rejection);
      Object.entries(fields).forEach(([name, message]) => setError(name as keyof LoginDto, { message }));
      if (Object.keys(fields).length === 0) setFormError(rejectionMessage(rejection));
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Iniciar sesión</CardTitle>
        <CardDescription>
          Demo: cualquier usuario con la contraseña <code className="font-mono">demo</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="username">Usuario</Label>
            <Input
              id="username"
              autoComplete="username"
              aria-invalid={Boolean(errors.username)}
              aria-describedby={errors.username ? "username-error" : undefined}
              {...register("username")}
            />
            {errors.username && (
              <p id="username-error" className="text-sm text-destructive">
                {errors.username.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="pr-10"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-1">
                <EyeToggle size="sm" variant="ghost" onToggle={setShowPassword} />
              </div>
            </div>
            {errors.password && (
              <p id="password-error" className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          {formError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />} Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
