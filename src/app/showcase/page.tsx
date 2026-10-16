import { LayoutGrid } from "lucide-react";

import AdminLayout from "@/components/layouts/AdminLayout";
import PageScaffold from "@/components/layouts/PageScaffold";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FeedbackDemo from "./_sections/FeedbackDemo";
import FormsDemo from "./_sections/FormsDemo";
import ImportDemo from "./_sections/ImportDemo";
import OutboxDemo from "./_sections/OutboxDemo";
import StoreDemo from "./_sections/StoreDemo";
import TableDemo from "./_sections/TableDemo";

export const metadata = { title: "Showcase" };

const SECTIONS = [
  { value: "table", label: "Tabla", content: <TableDemo /> },
  { value: "feedback", label: "Toasts y alertas", content: <FeedbackDemo /> },
  { value: "import", label: "Importar Excel", content: <ImportDemo /> },
  { value: "outbox", label: "Outbox (sin conexión)", content: <OutboxDemo /> },
  { value: "forms", label: "Formularios", content: <FormsDemo /> },
  { value: "store", label: "Store", content: <StoreDemo /> },
];

/**
 * Muestra viva de lo que trae la plantilla. Cada sección vive en `_sections/`
 * (carpeta privada: no genera ruta). Borra esta ruta, `_data/` y
 * `app/api/showcase` al iniciar un proyecto, o quédate con lo que te sirva de referencia.
 */
export default function ShowcasePage() {
  return (
    <AdminLayout>
      <PageScaffold
        title="Showcase"
        subtitle="Componentes y patrones incluidos en la plantilla"
        icon={<LayoutGrid className="h-5 w-5" />}
      >
        <Tabs defaultValue="table" className="gap-4">
          <TabsList className="h-auto flex-wrap justify-start">
            {SECTIONS.map((section) => (
              <TabsTrigger key={section.value} value={section.value}>
                {section.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {SECTIONS.map((section) => (
            <TabsContent key={section.value} value={section.value}>
              {section.content}
            </TabsContent>
          ))}
        </Tabs>
      </PageScaffold>
    </AdminLayout>
  );
}
