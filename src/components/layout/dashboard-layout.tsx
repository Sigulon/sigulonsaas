import React, { Suspense } from "react";
import { Header } from "./header";
import { DashboardWithCollapsibleSidebar } from "@/components/ui/dashboard-with-collapsible-sidebar";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardWithCollapsibleSidebar header={<Suspense fallback={null}><Header /></Suspense>}>
      {children}
    </DashboardWithCollapsibleSidebar>
  );
}
