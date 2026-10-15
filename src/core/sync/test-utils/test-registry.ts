import { defineEntity, type SyncEntityRegistry } from "../entities";

/** Registro para tests: `Payment` con tabla local, `Order` y `OrderItem` sin ella. */
export const TEST_REGISTRY = {
  Payment: defineEntity({ endpoint: "/api/payments", versionField: "version", local: { indexes: ["orderId", "date", "updatedAt"] } }),
  Order: defineEntity({ endpoint: "/api/orders" }),
  OrderItem: defineEntity({ endpoint: "/api/order-items" }),
} satisfies SyncEntityRegistry;

let counter = 0;

/** Opciones de una base nueva y aislada por test (fake-indexeddb). */
export const freshDatabase = (prefix: string) => ({
  name: `${prefix}-${++counter}`,
  registry: TEST_REGISTRY,
  schemaVersion: 1,
});
