import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-6">
      <LoginForm />
    </main>
  );
}
