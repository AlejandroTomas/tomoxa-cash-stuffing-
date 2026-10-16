"use client";

import { ThemeProvider } from "next-themes";

import StoreProvider from "@/providers/StoreProvider";
import { GlobalConfirmDialog } from "@/components/compound/GlobalConfirmDialog";
import { GlobalAlerts } from "@/components/feedback/notch/GlobalAlerts";
import { NotchToaster } from "@/components/feedback/notch/NotchToaster";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <NotchToaster />
        <GlobalAlerts />
        <GlobalConfirmDialog />
        {children}
      </ThemeProvider>
    </StoreProvider>
  );
}
