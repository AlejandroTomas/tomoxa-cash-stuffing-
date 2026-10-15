import { CircleDollarSign, LayoutDashboard, Receipt, ShoppingCart, UserPlus } from "lucide-react";

import AdminLayout from "@/components/layouts/AdminLayout";
import PageScaffold from "@/components/layouts/PageScaffold";
import { StatTile } from "@/components/shared/StatTile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionCard } from "./_components/SessionCard";

export const metadata = { title: "Dashboard" };

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 1 });
const count = new Intl.NumberFormat("es-MX");

// Datos de ejemplo: en tu proyecto vienen de un feature (service → thunk → selector).
const KPIS = [
  { label: "Ventas del mes", value: money.format(412_830), delta: 8.2, icon: <CircleDollarSign /> },
  { label: "Pedidos", value: count.format(1284), delta: 3.1, icon: <ShoppingCart /> },
  { label: "Ticket promedio", value: money.format(321.5), delta: -1.4, icon: <Receipt /> },
  { label: "Clientes nuevos", value: count.format(86), delta: 12, icon: <UserPlus /> },
];

const ACTIVITY = [
  { what: "Pedido P-1042 pagado", who: "Ana López", when: "hace 5 min" },
  { what: "Cliente C-0086 registrado", who: "Óscar Ruiz", when: "hace 22 min" },
  { what: "Importación de 96 productos", who: "Sistema", when: "hace 1 h" },
  { what: "Pedido P-1038 cancelado", who: "Lucía Cruz", when: "hace 3 h" },
];

/** Ejemplo de tablero. Reemplázalo por el del proyecto o bórralo. */
export default function DashboardPage() {
  return (
    <AdminLayout>
      <PageScaffold
        title="Dashboard"
        subtitle="Ejemplo de tablero con KPIs"
        icon={<LayoutDashboard className="h-5 w-5 text-white" />}
        headerActions={<Badge variant="outline">Datos de ejemplo</Badge>}
      >
        <div className="space-y-6">
          <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {KPIS.map((kpi) => (
              <StatTile key={kpi.label} {...kpi} comparedTo="vs. mes anterior" />
            ))}
          </section>
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Actividad reciente</CardTitle>
                <CardDescription>Lo último que pasó en el sistema.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {ACTIVITY.map((item) => (
                    <li key={item.what} className="flex items-center justify-between gap-4 py-3 text-sm">
                      <div>
                        <p className="font-medium text-foreground">{item.what}</p>
                        <p className="text-muted-foreground">{item.who}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{item.when}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <SessionCard />
          </div>
        </div>
      </PageScaffold>
    </AdminLayout>
  );
}
