"use client";

import { MousePointerClick } from "lucide-react";
import { Toaster } from "sileo";

import { notchToastOptions } from "@/core/toast";

/** Monta los toasts notch. Una sola vez, en los providers. */
export function NotchToaster() {
  return (
    <Toaster
      shape="notch"
      expandIcon={<MousePointerClick size={20} className="notch-hover-icon" aria-hidden="true" />}
      position="top-center"
      offset={{ top: "0px", bottom: "0px" }}
      options={notchToastOptions}
    />
  );
}
