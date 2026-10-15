import { Wallet } from "lucide-react";

import AdminLayout from "@/components/layouts/AdminLayout";
import PageScaffold from "@/components/layouts/PageScaffold";
import { Badge } from "@/components/ui/badge";
import { OrganizerExperience } from "@/features/organizer-3d/components/OrganizerExperience";

export const metadata = { title: "Organizador" };

export default function OrganizerPage() {
  return (
    <AdminLayout>
      <PageScaffold
        title="Organizador"
        subtitle="Tus sobres, todos en su lugar"
        icon={<Wallet className="h-5 w-5 text-white" />}
        headerActions={<Badge variant="outline">Datos de ejemplo</Badge>}
      >
        <OrganizerExperience />
      </PageScaffold>
    </AdminLayout>
  );
}
