"use client";

import { createContext, useContext, useMemo } from "react";
import { visibleNavItems, type NavFeatures } from "@/components/nav-items";

// Which early features the workspace in view can use, worked out once by the
// app layout, so the sidebar, mobile menu and command palette agree.
const NavFeaturesContext = createContext<NavFeatures>({ ig_automations: false, reply_desk: false });

export function NavFeaturesProvider({
  value,
  children,
}: {
  value: NavFeatures;
  children: React.ReactNode;
}) {
  return <NavFeaturesContext.Provider value={value}>{children}</NavFeaturesContext.Provider>;
}

/** The nav items this workspace can use. */
export function useNavItems() {
  const features = useContext(NavFeaturesContext);
  return useMemo(() => visibleNavItems(features), [features]);
}
