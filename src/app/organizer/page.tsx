import { permanentRedirect } from "next/navigation";

/** El organizador vive en la página de inicio. */
export default function OrganizerPage() {
  permanentRedirect("/");
}
