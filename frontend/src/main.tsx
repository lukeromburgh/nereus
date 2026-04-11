import React, { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AppShell from "./components/AppShell";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Lazy-loaded route pages — each is a heavy subtree (VTK viewport, drag-and-drop
// tree, dual-viewport comparison). Loading them on demand instead of eagerly
// reduces the initial JS bundle by roughly the combined size of all three pages,
// and prevents blocking the browser during the first paint.
const SimulationPage = React.lazy(() => import("./App"));
const AssetManagerPage = React.lazy(() => import("./pages/AssetManagerPage"));
const RunComparisonPage = React.lazy(() => import("./pages/RunComparisonPage"));

// Minimal fallback — avoids layout shift while the async chunk loads.
// AppShell itself is kept synchronously because the shell layout (navbar,
// sidebar) must be present for first paint.
const PageFallback = () => (
  <div className="flex h-screen items-center justify-center bg-slate-950">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
  </div>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/"
            element={
              <Suspense fallback={<PageFallback />}>
                <SimulationPage />
              </Suspense>
            }
          />
          <Route
            path="/assets"
            element={
              <Suspense fallback={<PageFallback />}>
                <AssetManagerPage />
              </Suspense>
            }
          />
          <Route
            path="/comparison"
            element={
              <Suspense fallback={<PageFallback />}>
                <RunComparisonPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
