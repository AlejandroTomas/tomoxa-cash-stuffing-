import { ListChecks } from "lucide-react";

import AdminLayout from "@/components/layouts/AdminLayout";
import PageScaffold from "@/components/layouts/PageScaffold";
import { TaskBoard } from "@/features/_example/components/TaskBoard";

export const metadata = { title: "Feature de ejemplo" };

/** Las páginas son delgadas: montan el componente del feature y nada más. */
export default function ExamplePage() {
  return (
    <AdminLayout>
      <PageScaffold
        title="Feature de ejemplo"
        subtitle="features/_example: todas las capas, listo para copiar"
        icon={<ListChecks className="h-5 w-5" />}
      >
        <div className="mx-auto max-w-2xl">
          <TaskBoard />
        </div>
      </PageScaffold>
    </AdminLayout>
  );
}
