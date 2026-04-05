import { createContext, useContext, type ReactNode } from "react";

// ── Toolbar Context ──────────────────────────────────────────────────────────
// Pages call `useToolbar()` to inject their specific controls into the top bar.

interface ToolbarContextValue {
  setToolbarContent: (content: ReactNode) => void;
}

export const ToolbarContext = createContext<ToolbarContextValue | null>(null);

export function useToolbar() {
  const ctx = useContext(ToolbarContext);
  if (!ctx) throw new Error("useToolbar must be used within <AppShell>");
  return ctx;
}
