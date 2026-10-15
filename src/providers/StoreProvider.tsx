"use client";

import { useState, type ReactNode } from "react";
import { Provider } from "react-redux";

import { getOrCreateStore } from "@/store";

export default function StoreProvider({ children }: { children: ReactNode }) {
  // `useState` con inicializador: el store se crea una sola vez por montaje.
  const [store] = useState(getOrCreateStore);
  return <Provider store={store}>{children}</Provider>;
}
