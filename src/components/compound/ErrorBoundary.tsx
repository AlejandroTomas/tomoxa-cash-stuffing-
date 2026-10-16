"use client";

import React, { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

import {
  AlertTriangle,
  RefreshCw,
  Home,
  Copy,
  CheckCircle,
  Bug,
} from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string | null;
  copied: boolean;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const errorId =
      this.state.errorId ??
      `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.setState({
      error,
      errorInfo,
      errorId,
    });

    const details = {
      errorId,
      error,
      errorInfo,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // Logica para guardar el error en un servicio de logging o enviarlo a un servidor
    console.error("ErrorBoundary caught an error:", details);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = "/";
  };

  handleCopyErrorId = (): void => {
    if (this.state.errorId) {
      navigator.clipboard.writeText(this.state.errorId);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const isDevelopment = process.env.NODE_ENV === "development";

      return (
        <div className="w-full min-h-screen flex items-center justify-center bg-gradient-to-br from-destructive/5 via-background to-warning/5 p-4">
          <Card className="w-full max-w-2xl shadow-2xl border-2 border-border">
            <CardHeader className="text-center space-y-4 pb-4">
              <div className="flex justify-center">
                <div className="h-20 w-20 bg-gradient-to-br from-destructive to-warning rounded-full flex items-center justify-center animate-pulse">
                  <AlertTriangle className="h-10 w-10 text-primary-foreground" />
                </div>
              </div>
              <div>
                <CardTitle className="text-3xl font-bold text-foreground">
                  ¡Ups! Algo salió mal
                </CardTitle>
                <CardDescription className="mt-2 text-base">
                  La aplicación encontró un error inesperado. Nuestro equipo ha
                  sido notificado automáticamente.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* ID de error */}
              <div className="p-4 bg-muted rounded-lg border border-border">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-foreground">
                    ID de error (compártelo con soporte):
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={this.handleCopyErrorId}
                    className="gap-2"
                  >
                    {this.state.copied ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-success" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copiar
                      </>
                    )}
                  </Button>
                </div>
                <code className="block p-3 bg-card rounded border border-border text-sm font-mono text-foreground">
                  {this.state.errorId}
                </code>
              </div>

              {/* Tipo de error */}
              {this.state.error && (
                <Alert>
                  <Bug className="h-4 w-4" />
                  <AlertDescription>
                    <span className="font-semibold">Tipo de error:</span>{" "}
                    {this.state.error.name}
                  </AlertDescription>
                </Alert>
              )}

              {/* Acciones */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  onClick={this.handleReload}
                  className="gap-2"
                  size="lg"
                >
                  <RefreshCw className="h-5 w-5" />
                  Recargar Aplicación
                </Button>
                <Button
                  variant="outline"
                  onClick={this.handleGoHome}
                  className="gap-2 border-2"
                  size="lg"
                >
                  <Home className="h-5 w-5" />
                  Volver al Inicio
                </Button>
              </div>

              {/* Nota de soporte */}
              <div className="text-center">
                <Badge variant="secondary" className="px-4 py-2">
                  Si el problema persiste, contacta a soporte técnico
                </Badge>
              </div>

              {/* Solo en desarrollo: detalles completos */}
              {isDevelopment && this.state.error && (
                <Card className="border-destructive/30 bg-destructive/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-destructive">
                      <Bug className="h-5 w-5" />
                      ⚠️ Información de desarrollo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs p-4 bg-card rounded border border-border overflow-x-auto whitespace-pre-wrap text-foreground">
                      <code>
                        {this.state.error.message}
                        {this.state.errorInfo?.componentStack}
                      </code>
                    </pre>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
