// types/next.d.ts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { NextApiRequest } from "next";

declare module "next" {
  interface NextApiRequest extends NextApiRequest {
    user?: { userId: string; username: string; clientId: string }; // Extiende la interfaz con la propiedad 'user'
  }
}
