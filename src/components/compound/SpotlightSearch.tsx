import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  FileText,
  Users,
  Settings,
  BarChart3,
  Clock,
  MapPin,
  Calendar,
  Home,
  LogOut,
  Command,
} from "lucide-react";

// Configuración de rutas y acciones
const searchItems = [
  // Navegación
  {
    id: "home",
    title: "Inicio",
    description: "Ir al dashboard principal",
    icon: Home,
    path: "/cliente",
    type: "page",
  },
  {
    id: "workers",
    title: "Trabajadores",
    description: "Gestionar empleados",
    icon: Users,
    path: "/cliente/trabajadores",
    type: "page",
  },
  {
    id: "workplaces",
    title: "Zonas",
    description: "Lugares de trabajo",
    icon: MapPin,
    path: "/cliente/workplaces",
    type: "page",
  },
  {
    id: "reports",
    title: "Reportes",
    description: "Ver reportes de asistencia",
    icon: BarChart3,
    path: "/cliente/reportes",
    type: "page",
  },
  {
    id: "config",
    title: "Configuración",
    description: "Ajustes de cuenta",
    icon: Settings,
    path: "/cliente/configuracion",
    type: "page",
  },

  // Acciones rápidas
  {
    id: "new-worker",
    title: "Nuevo Trabajador",
    description: "Crear un nuevo empleado",
    icon: Users,
    action: "create-worker",
    type: "action",
  },
  {
    id: "manual-checkin",
    title: "Crear Sesión Manual",
    description: "Registrar asistencia manual",
    icon: Clock,
    action: "manual-checkin",
    type: "action",
  },
  {
    id: "individual-report",
    title: "Reporte Individual",
    description: "Consultar reporte de un empleado",
    icon: FileText,
    action: "individual-report",
    type: "action",
  },
  {
    id: "period-report",
    title: "Reporte por Período",
    description: "Consultar reporte de rango de fechas",
    icon: Calendar,
    action: "period-report",
    type: "action",
  },
  {
    id: "logout",
    title: "Cerrar Sesión",
    description: "Salir de la aplicación",
    icon: LogOut,
    action: "logout",
    type: "action",
  },
];

interface SpotlightSearchProps {
  onAction?: (action: string) => void;
}

const SpotlightSearch: React.FC<SpotlightSearchProps> = ({ onAction }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  // Filtrar resultados basados en la búsqueda
  const filteredItems = useMemo(() => {
    if (!search) return searchItems;

    const query = search.toLowerCase();
    return searchItems.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
    );
  }, [search]);

  // Manejar selección de items
  const handleSelect = useCallback(
    (item: (typeof searchItems)[0]) => {
      if (item.path) {
        router.push(item.path);
      } else if (item.action && onAction) {
        onAction(item.action);
      }
      setIsOpen(false);
      setSearch("");
      setSelectedIndex(0);
    },
    [router, onAction]
  );

  // Abrir/cerrar con Cmd+K o Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setSearch("");
        setSelectedIndex(0);
      }

      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        setSearch("");
        setSelectedIndex(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Navegación con flechas
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : prev
        );
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      }

      if (e.key === "Enter" && filteredItems[selectedIndex]) {
        e.preventDefault();
        handleSelect(filteredItems[selectedIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredItems, handleSelect]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Buscar acciones o páginas..."
            className="border-0 focus-visible:ring-0 text-lg bg-transparent"
          />
          <Badge variant="outline" className="gap-1 text-xs">
            <Command className="h-3 w-3" />K
          </Badge>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {filteredItems.length > 0 ? (
            <div className="py-2">
              {filteredItems.map((item, index) => {
                const Icon = item.icon;
                const isSelected = index === selectedIndex;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center gap-4 px-4 py-3 transition-colors ${
                      isSelected
                        ? "bg-primary/10 border-l-2 border-primary"
                        : "hover:bg-muted/50 border-l-2 border-transparent"
                    }`}
                  >
                    <div
                      className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        item.type === "page"
                          ? "bg-blue-100 dark:bg-blue-900/30"
                          : "bg-green-100 dark:bg-green-900/30"
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${
                          item.type === "page"
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-green-600 dark:text-green-400"
                        }`}
                      />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-foreground">
                        {item.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    <Badge
                      variant={item.type === "page" ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {item.type === "page" ? "Página" : "Acción"}
                    </Badge>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center">
              <div className="mx-auto h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-foreground font-semibold">
                No se encontraron resultados
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Intenta con otros términos de búsqueda
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-2 py-1 bg-card border border-border rounded">
                  ↑↓
                </kbd>
                Navegar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-2 py-1 bg-card border border-border rounded">
                  Enter
                </kbd>
                Seleccionar
              </span>
            </div>
            <span className="flex items-center gap-1">
              <kbd className="px-2 py-1 bg-card border border-border rounded">
                Esc
              </kbd>
              Cerrar
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpotlightSearch;
