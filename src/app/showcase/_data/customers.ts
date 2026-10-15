/**
 * Datos de ejemplo del showcase: 120 clientes generados de forma determinista
 * (siempre los mismos), para que cliente y servidor muestren lo mismo.
 * Bórralo junto con `/showcase` y `/api/showcase`.
 */
export type CustomerStatus = "active" | "pending" | "blocked";

export interface DemoCustomer {
  id: string;
  name: string;
  email: string;
  city: string;
  status: CustomerStatus;
  tags: string[];
  balance: number;
  createdAt: string; // yyyy-MM-dd
}

export const STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "Activo",
  pending: "Pendiente",
  blocked: "Bloqueado",
};

export const CITIES = ["Oaxaca", "CDMX", "Puebla", "Guadalajara", "Monterrey", "Mérida"];
export const TAGS = ["mayoreo", "crédito", "vip", "nuevo"];

const FIRST = ["Ana", "Óscar", "Lucía", "José", "María", "Iván", "Sofía", "Raúl", "Elena", "Tomás", "Paula", "Héctor"];
const LAST = ["López", "Ruiz", "Martínez", "Hernández", "García", "Pérez", "Sánchez", "Ramírez", "Cruz", "Gómez"];

/** Generador congruencial: pseudoaleatorio pero reproducible. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function buildCustomers(): DemoCustomer[] {
  const random = seeded(209);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const statuses: CustomerStatus[] = ["active", "active", "active", "pending", "blocked"];
  const start = Date.UTC(2025, 0, 1);

  return Array.from({ length: 120 }, (_, index) => {
    const first = pick(FIRST);
    const last = pick(LAST);
    const created = new Date(start + Math.floor(random() * 650) * 86400000);
    return {
      id: `C-${String(index + 1).padStart(4, "0")}`,
      name: `${first} ${last}`,
      email: `${first}.${last}${index}@ejemplo.mx`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
      city: pick(CITIES),
      status: pick(statuses),
      tags: TAGS.filter(() => random() < 0.3),
      balance: Math.round(random() * 5000000) / 100,
      createdAt: created.toISOString().slice(0, 10),
    };
  });
}

export const DEMO_CUSTOMERS: readonly DemoCustomer[] = buildCustomers();
